// Public: the QR code page. Anyone with the company's shoutout link can give a shoutout,
// see the wall, react and report. No login. Names outside the portal are first name + last initial.
//
// GET  ?q=name          -> up to 8 matching people from the roster (for picking who)
// GET  ?d=<device>      -> company, values, wall, scoreboard
// POST { action: "give" | "react" | "report", ... }

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { celebrations, REACTIONS, scoreboard, shortName, Shoutout } from "@/lib/recognition";
import { clientByToken, createShout, localToday, localTodayISO, matchPeople, rosterFor, tellReviewers } from "@/lib/shoutserver";
import { pollFor, votePoll } from "@/lib/pollserver";
import { challengesFor, checkChainPass, shoutsSince } from "@/lib/challengeserver";
import { publicChallenge } from "@/lib/challenges";
import { admin, SERVER_LIVE, siteUrl } from "@/lib/server";

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: D, status = 200) => NextResponse.json(b, { status, headers: H });
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
const cleanDevice = (d: unknown) => String(d ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
const ip = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const { token } = await params;
  const db = admin();
  const c = await clientByToken(db, token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  const u = new URL(req.url);
  const q = u.searchParams.get("q");
  if (q != null) {
    const hits = matchPeople(await rosterFor(db, c.id), q);
    return json({ ok: true, people: hits.map((p) => ({ id: p.id, name: shortName(p.name), team: p.department || p.location || "" })) });
  }
  const roster = await rosterFor(db, c.id);
  // opened from a "pass it on" link
  const passId = u.searchParams.get("pass");
  let pass: { id: string; title: string; link: number; holder: { id: string; name: string; team: string }; daysLeft: number; error?: string } | null = null;
  if (passId) {
    const { data: pr } = await db.from("shoutouts").select("data").eq("id", passId).eq("client_id", c.id).maybeSingle();
    const ps = pr?.data as Shoutout | undefined;
    const { data: chr } = ps?.challengeId ? await db.from("challenges").select("data").eq("id", ps.challengeId).maybeSingle() : { data: null };
    const ch = chr?.data as { title: string; chain?: { windowDays: number }; status: string } | undefined;
    if (ps && ch) {
      const left = Math.ceil((new Date(ps.at).getTime() + (ch.chain?.windowDays ?? 3) * 864e5 - Date.now()) / 864e5);
      const holder = roster.find((p) => p.id === ps.to.personId);
      pass = { id: ps.id, title: ch.title, link: (ps.depth ?? 1) + 1, holder: { id: ps.to.personId, name: shortName(ps.to.name), team: holder?.department || holder?.location || "" }, daysLeft: left, error: ch.status !== "active" ? "over" : left < -1 ? "expired" : undefined };
    }
  }
  const device = cleanDevice(u.searchParams.get("d"));
  const { data: rows } = await db.from("shoutouts").select("data").eq("client_id", c.id).eq("data->>status", "live").order("created_at", { ascending: false }).limit(300);
  const list = (rows ?? []).map((r) => r.data as Shoutout);
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const wall = c.rec.showWall === false ? [] : list.slice(0, 60);
  const ids = wall.map((s) => s.id);
  const { data: rx } = ids.length ? await db.from("shout_reactions").select("shout_id, who, emoji").in("shout_id", ids) : { data: [] };
  const me = device ? `d:${hash(device)}` : "";
  const celebrate = c.rec.celebrate === false ? [] : celebrations(roster, localToday(), 14);
  const active = await challengesFor(db, c.id);
  const chShouts = active.length ? await shoutsSince(db, c.id, active.reduce((m, x) => (x.startedAt < m ? x.startedAt : m), active[0].startedAt)) : [];
  // a person on the Welcome Wagon only needs to know counts, so shoutouts before the earliest new hire don't matter
  const wagon = active.some((x) => x.kind === "welcome") ? await shoutsSince(db, c.id, new Date(Date.now() - 120 * 864e5).toISOString()) : [];
  const poll = c.rec.showWall === false ? null : await pollFor(db, c.id, c.rec.polls, localTodayISO(), me || undefined);
  return json({
    poll,
    celebrate,
    pass,
    challenges: active.map((x) => publicChallenge(x, x.kind === "welcome" ? wagon : chShouts, roster)),
    ok: true,
    company: c.name,
    accent: c.config.accent || "#19283c",
    theme: c.rec.theme ?? null,
    logo: c.config.logoEmail || c.config.logo || null,
    values: c.rec.values,
    sms: c.rec.smsNumber ?? null,
    showWall: c.rec.showWall !== false,
    board: c.rec.showWall === false ? null : scoreboard(list, c.rec.values, since),
    wall: wall.map((s) => ({
      id: s.id,
      to: shortName(s.to.name),
      team: s.to.department || s.to.location || "",
      from: shortName(s.from.name),
      value: s.value ?? null,
      message: s.message,
      at: s.at,
      reactions: Object.fromEntries(REACTIONS.map((e) => [e, (rx ?? []).filter((r) => r.shout_id === s.id && r.emoji === e).length])),
      mine: (rx ?? []).filter((r) => r.shout_id === s.id && r.who === me).map((r) => r.emoji),
    })),
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
  const db = admin();
  const c = await clientByToken(db, token);
  if (!c) return json({ ok: false, reason: "not_found" }, 404);
  const device = cleanDevice(b.device);
  if (device.length < 12) return json({ ok: false, reason: "bad_request" }, 400);
  const who = `d:${hash(device)}`;
  const net = hash(ip(req));

  if (b.action === "vote") {
    const poll = await votePoll(db, c.id, c.rec.polls, localTodayISO(), who, String(b.choice ?? ""));
    return poll ? json({ ok: true, poll }) : json({ ok: false, reason: "bad_request" }, 400);
  }

  if (b.action === "give") {
    const roster = await rosterFor(db, c.id);
    const to = roster.find((p) => p.id === String(b.to ?? ""));
    if (!to) return json({ ok: false, reason: "who" }, 400);
    const message = String(b.message ?? "").trim();
    if (message.length < 3) return json({ ok: false, reason: "short" }, 400);
    // limits: 10 a day from one phone, 40 a day from one network
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const [byDevice, byNet] = await Promise.all([
      db.from("shoutouts").select("id", { count: "exact", head: true }).eq("client_id", c.id).eq("data->>device", who).gte("created_at", dayAgo),
      db.from("shoutouts").select("id", { count: "exact", head: true }).eq("client_id", c.id).eq("data->>net", net).gte("created_at", dayAgo),
    ]);
    if ((byDevice.count ?? 0) >= 10 || (byNet.count ?? 0) >= 40) return json({ ok: false, reason: "limit" }, 429);
    let chain: { challengeId: string; parentId: string; depth: number } | undefined;
    let fromP = b.fromId ? roster.find((p) => p.id === String(b.fromId)) : undefined;
    if (b.pass) {
      const ck = await checkChainPass(db, c.id, String(b.pass), to.id);
      if (!ck.ok) return json({ ok: false, reason: ck.reason }, 400);
      chain = { challengeId: ck.challenge.id, parentId: ck.parent.id, depth: ck.depth };
      fromP = roster.find((p) => p.id === ck.parent.to.personId) ?? fromP; // the baton holder passes it on
    }
    if (fromP && fromP.id === to.id) return json({ ok: false, reason: "self" }, 400);
    const fromName = fromP?.name ?? String(b.fromName ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!fromName) return json({ ok: false, reason: "from" }, 400);
    const s = await createShout(db, siteUrl(req), c, {
      to,
      from: { name: fromName, personId: fromP?.id, verified: false },
      value: b.value ? String(b.value) : undefined,
      message,
      channel: "qr",
      lang: b.lang === "es" ? "es" : "en",
      ...chain,
    });
    // who sent it (hashed) for the daily limit; never shown
    await db.from("shoutouts").update({ data: { ...s, device: who, net } }).eq("id", s.id);
    return json({ ok: true, status: s.status });
  }

  const id = String(b.id ?? "");
  const { data: row } = await db.from("shoutouts").select("data").eq("id", id).eq("client_id", c.id).maybeSingle();
  const s = row?.data as (Shoutout & { reportedBy?: string[] }) | undefined;
  if (!s || s.status !== "live") return json({ ok: false, reason: "not_found" }, 404);

  if (b.action === "react") {
    const emoji = String(b.emoji ?? "");
    if (!(REACTIONS as readonly string[]).includes(emoji)) return json({ ok: false, reason: "bad_request" }, 400);
    const { data: had } = await db.from("shout_reactions").select("emoji").eq("shout_id", id).eq("who", who).eq("emoji", emoji).maybeSingle();
    if (had) await db.from("shout_reactions").delete().eq("shout_id", id).eq("who", who).eq("emoji", emoji);
    else await db.from("shout_reactions").insert({ shout_id: id, client_id: c.id, who, emoji });
    return json({ ok: true, on: !had });
  }

  if (b.action === "report") {
    const by = new Set(s.reportedBy ?? []);
    if (by.has(who)) return json({ ok: true });
    by.add(who);
    // two reports takes it off the wall until someone looks
    const next = { ...s, reportedBy: [...by], reports: by.size, ...(by.size >= 2 ? { status: "held" as const, heldReason: "Reported by coworkers" } : {}) };
    await db.from("shoutouts").update({ data: next }).eq("id", id);
    if (by.size === 1 || by.size === 2) await tellReviewers(db, siteUrl(req), c, { ...next, heldReason: by.size >= 2 ? "Reported twice, taken off the wall" : "Reported once, still on the wall" });
    return json({ ok: true, hidden: by.size >= 2 });
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
