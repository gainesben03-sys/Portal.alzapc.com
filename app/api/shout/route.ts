// Signed in: give a shoutout from the portal, react, and (Ben and executives) review held ones.
// POST { clientId, action: "give", to, value?, message }
// POST { clientId, action: "react", id, emoji }
// POST { clientId, action: "review", id, approve }   Ben or an executive
// POST { clientId, action: "remove", id }            Ben, an executive, or the person's manager

import { NextResponse } from "next/server";
import { REACTIONS, Shoutout } from "@/lib/recognition";
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
    const m = celebrateMail(draft, siteUrl(req), { id: "test", name: "Alex Sample", managerName: "Jordan Lee" }, kind, kind === "anniversary" ? 3 : undefined);
    const r = await sendEmail({ to: [me.email], subject: `[Test] ${m.subject}`, text: m.text, html: m.html, fromName: m.fromName, fromBox: m.fromBox });
    return NextResponse.json({ ok: r.ok, reason: r.reason, to: me.email });
  }

  if (b.action === "give") {
    const to = roster.find((p) => p.id === String(b.to ?? ""));
    if (!to) return NextResponse.json({ ok: false, reason: "who" }, { status: 400 });
    if (to.email && to.email.toLowerCase() === me.email.toLowerCase()) return NextResponse.json({ ok: false, reason: "self" }, { status: 400 });
    const mine = roster.find((p) => p.email?.toLowerCase() === me.email.toLowerCase());
    const s = await createShout(db, siteUrl(req), c, { to, from: { name: myName, personId: mine?.id, email: me.email, verified: true }, value: b.value ? String(b.value) : undefined, message: String(b.message ?? ""), channel: "portal" });
    return NextResponse.json({ ok: true, status: s.status, shout: s });
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
