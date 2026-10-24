// Push notifications: sign a device up, change what you get, send a test,
// and two triggers from the browser (a heads-up to Ben, a new request for a client).
// Recipients are always worked out here on the server.
import { NextResponse } from "next/server";
import { advisorEmails, PUSH_READY, pushTo } from "@/lib/push";
import { PushTopic } from "@/lib/pushtopics";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { fmt } from "@/lib/data";

const TOPICS: PushTopic[] = ["activity", "requests", "reminders", "replies", "hires"];

export async function GET(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  const db = admin();
  const email = me.email.toLowerCase();
  const [{ data: p }, { count }] = await Promise.all([
    db.from("push_prefs").select("topics").eq("email", email).maybeSingle(),
    db.from("push_subs").select("endpoint", { count: "exact", head: true }).eq("email", email),
  ]);
  return NextResponse.json({ ok: true, ready: PUSH_READY, topics: p?.topics ?? {}, devices: count ?? 0 });
}

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = admin();
  const email = me.email.toLowerCase();
  const s = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

  switch (b.action) {
    case "subscribe": {
      const sub = b.sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return NextResponse.json({ ok: false, reason: "bad_sub" }, { status: 400 });
      const { error } = await db.from("push_subs").upsert({ endpoint: sub.endpoint, email, sub, agent: s(req.headers.get("user-agent"), 300) });
      if (error) return NextResponse.json({ ok: false, reason: /push_subs/.test(error.message) ? "no_table" : "save_failed" });
      return NextResponse.json({ ok: true });
    }
    case "unsubscribe": {
      await db.from("push_subs").delete().eq("endpoint", s(b.endpoint, 1000)).eq("email", email);
      return NextResponse.json({ ok: true });
    }
    case "prefs": {
      const t = (b.topics ?? {}) as Record<string, unknown>;
      const topics = Object.fromEntries(TOPICS.filter((k) => k in t).map((k) => [k, t[k] !== false]));
      const { error } = await db.from("push_prefs").upsert({ email, topics, updated_at: new Date().toISOString() });
      return NextResponse.json({ ok: !error });
    }
    case "test": {
      const n = await pushTo(db, [email], (me.advisor ? "activity" : "requests") as PushTopic, { title: "Alerts are on", body: "This is what a portal alert looks like. You can change what you get any time.", url: "/", tag: "test" });
      return NextResponse.json({ ok: n > 0, sent: n, reason: PUSH_READY ? (n ? undefined : "no_device") : "not_configured" });
    }
    case "ben": {
      // any signed-in portal user can give Ben a heads-up; the text comes from the app's own events
      const topic: PushTopic = b.topic === "hires" ? "hires" : "activity";
      if (me.advisor) return NextResponse.json({ ok: true, skipped: true }); // Ben doesn't alert himself
      const url = s(b.url, 300);
      const n = await pushTo(db, await advisorEmails(db), topic, { title: s(b.title, 120) || "Portal activity", body: s(b.body, 300), url: url.startsWith("/") ? url : "/console", tag: s(b.tag, 80) || undefined });
      return NextResponse.json({ ok: true, sent: n });
    }
    case "task": {
      // Ben assigned something: alert the owner
      if (!me.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
      const { data: a } = await db.from("actions").select("id, client_id, data").eq("id", s(b.actionId, 80)).maybeSingle();
      if (!a) return NextResponse.json({ ok: false, reason: "not_found" });
      const d = a.data as { title?: string; kind?: string; side?: string; owner?: { email?: string; name?: string }; due?: string };
      if (d.side !== "client" || !d.owner?.email) return NextResponse.json({ ok: true, skipped: true });
      const n = await pushTo(db, [d.owner.email], "requests", {
        title: d.kind === "approval" ? "Ben needs your approval" : "New request from Ben",
        body: `${d.title ?? "A new item"}${d.due ? ` · due ${fmt(d.due)}` : ""}`,
        url: `/c/${a.client_id}/a/${a.id}`,
        tag: `task-${a.id}`,
      });
      return NextResponse.json({ ok: true, sent: n });
    }
  }
  return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
}
