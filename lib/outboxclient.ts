"use client";

// Outbox in the browser. Live: every call goes to /api/outbox, which checks who's asking.
// Public demo: the same actions run in this browser with made-up emails. Nothing is ever sent.
import { useEffect, useState } from "react";
import { OutboxMode, OutMail, OutRow } from "./outbox";
import { authHeader, LIVE } from "./supabase";

export interface OutList {
  held: OutRow[];
  hiddenCount: number;
  digest: OutRow[];
  history: OutRow[];
  companies: { id: string; name: string; mode: OutboxMode }[];
  benDigest?: boolean;
}
type Res<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

async function post<T>(body: object): Promise<Res<T>> {
  try {
    const r = await fetch("/api/outbox", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
    return (await r.json()) as Res<T>;
  } catch {
    return { ok: false, reason: "offline" };
  }
}

// ---------- demo ----------
const KEY = "alza-demo-outbox-v1";
interface Demo { mails: OutMail[]; modes: Record<string, OutboxMode>; benDigest: boolean }
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const mailHtml = (company: string, accent: string, title: string, paras: string[], button?: string) =>
  `<div style="background:#f5f3ee;padding:28px 12px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e1d6"><div style="background:${accent};color:#fff;padding:16px 24px;font-weight:bold;letter-spacing:.02em">${company}</div><div style="padding:26px 24px;color:#19283c;font-size:15px;line-height:1.55"><h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 14px;font-size:22px">${title}</h2>${paras.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join("")}${button ? `<p style="margin:20px 0 4px"><a style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold">${button}</a></p>` : ""}</div></div><p style="text-align:center;color:#8a93a3;font-size:12px;margin:14px 0 0">Sent by the ${company} Alza Hub</p></div>`;

function seed(): Demo {
  const H = "Harborlight", a = "#19283c";
  const base = { clientId: "harborlight", status: "held" as const, sensitive: false, fromName: H };
  const m = (id: string, x: Partial<OutMail> & Pick<OutMail, "to" | "subject" | "text" | "audience" | "auto" | "createdAt">): OutMail => ({ ...base, id, ...x });
  return {
    modes: { harborlight: "auto" },
    benDigest: false,
    mails: [
      m("obd1", { to: ["jordan.lee@example.com"], subject: "Welcome to Harborlight, Jordan!", audience: "employee", auto: true, createdAt: ago(3),
        text: "Hi Jordan, we're excited to have you start Monday at 9:00.",
        html: mailHtml(H, a, "Welcome to the team, Jordan", ["We're excited to have you start <b>Monday, December 1 at 9:00 AM</b>. Dana Ortiz will meet you at the front desk.", "Before then, take five minutes to fill out your new hire forms so your first day is about people, not paperwork."], "Start my forms") }),
      m("obd2", { to: ["dana@example.com"], subject: "Reminder: Chris Wu's annual review is due in 7 days", audience: "leader", auto: true, createdAt: ago(5),
        text: "Chris Wu's annual review is due Friday, December 5.",
        html: mailHtml(H, a, "Chris Wu's review is due in 7 days", ["Chris's annual review is due <b>Friday, December 5</b>. Chris finished the self-assessment last week, so you'll see those answers as you write.", "Most managers take about 20 minutes."], "Open the review") }),
      m("obd3", { to: ["sam.ortiz@example.com"], subject: "Happy 5 years at Harborlight, Sam!", audience: "employee", auto: true, createdAt: ago(6),
        text: "Five years ago today you joined Harborlight. Thank you.",
        html: mailHtml(H, a, "Happy 5 years, Sam", ["Five years ago today you joined Harborlight. Thank you for everything you bring to the team.", "Alex and the whole leadership team"]) }),
      m("obd4", { to: ["priya.n@example.com"], cc: ["dana@example.com"], subject: "Dana gave you a shoutout", audience: "employee", auto: false, createdAt: ago(1),
        text: "Dana Ortiz recognized you for Customer First.",
        html: mailHtml(H, a, "You got a shoutout", ["<b>Dana Ortiz</b> recognized you for <b>Customer First</b>:", "<i>\"Priya stayed late to get the Ramirez order out the door on time. The customer called to say thanks.\"</i>"], "See it on the wall") }),
      m("obd5", { to: ["alex@example.com"], subject: "The People Brief | Harborlight | Nov 24", audience: "leader", auto: true, createdAt: ago(20), fromName: "The People Brief", fromBox: "peoplebrief",
        text: "Your weekly People Brief.",
        html: mailHtml(H, a, "The People Brief", ["<b>Needs your attention</b><br>Approve the 2027 holiday calendar (due Wednesday).", "<b>Your people</b><br>Jordan Lee starts Monday. Sam Ortiz hits 5 years this week.", "<b>HR priorities</b><br>Handbook refresh: on track. Benefits renewal: at risk, waiting on carrier quotes."], "Open the Alza Hub") }),
      m("obd6", { to: ["chris.wu@example.com"], subject: "Your self-assessment is ready", audience: "employee", auto: true, createdAt: ago(28), sensitive: false,
        text: "Your manager would like your input before your review.",
        html: mailHtml(H, a, "Your self-assessment is ready", ["Dana would like your input before your annual review. It takes about 10 minutes and you can answer in English or Spanish."], "Start") }),
      m("obd7", { to: ["chris.wu@example.com"], subject: "Leave of absence: next steps", audience: "employee", auto: false, sensitive: true, createdAt: ago(2),
        text: "Here is what happens next with your leave.", html: mailHtml(H, a, "Your leave: next steps", ["Here is what happens next with your leave request."]) }),
      { ...base, id: "obd8", clientId: "bayside", to: ["avery@example.com"], subject: "Jules Carter's 30-day check-in is coming up", audience: "leader", auto: true, createdAt: ago(9), fromName: "Bayside Residential",
        text: "Jules Carter's 30-day check-in is Thursday.", html: mailHtml("Bayside Residential", "#1d4f7a", "A 30-day check-in is coming up", ["Jules Carter's 30-day check-in is <b>Thursday</b>. Three questions, ten minutes."], "Open the check-in") },
      // already decided
      { ...base, id: "obd9", to: ["dana@example.com"], subject: "Reminder: 2 reviews due this month", audience: "leader", auto: true, createdAt: ago(50), status: "sent", doneAt: ago(46), doneBy: "Ben Gaines", text: "Two reviews are due this month.", html: mailHtml(H, a, "2 reviews due this month", ["Chris Wu and Priya Nair."]) },
      { ...base, id: "obd10", to: ["team@example.com"], subject: "Happy birthday, Morgan!", audience: "employee", auto: true, createdAt: ago(70), status: "skipped", doneAt: ago(66), doneBy: "Alex Rivera", text: "Happy birthday!", html: mailHtml(H, a, "Happy birthday, Morgan", ["Wishing you a great day."]) },
    ],
  };
}
function load(): Demo {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Demo | null;
    if (d?.mails) return d;
  } catch {}
  return seed();
}
function store(d: Demo) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
}
const toRow = (m: OutMail): OutRow => {
  const { attachments, text, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, html: undefined, attachments: attachments?.map((a) => a.filename) };
};

/** Demo: who is looking. Ben sees all; an executive sees their company, minus Ben-only emails. */
interface Viewer { advisor: boolean; clientId?: string; name: string }
const may = (v: Viewer, m: OutMail) => v.advisor || (m.clientId === v.clientId && !m.sensitive && m.audience !== "ben");

export const outboxApi = {
  async list(v: Viewer, names: { id: string; name: string }[]): Promise<Res<OutList>> {
    if (LIVE) return post<OutList>({ action: "list", clientId: v.clientId });
    const d = load();
    const scoped = d.mails.filter((m) => !v.clientId || m.clientId === v.clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const held = scoped.filter((m) => m.status === "held");
    const mine = held.filter((m) => may(v, m));
    return {
      ok: true,
      held: mine.map(toRow),
      hiddenCount: held.length - mine.length,
      digest: [],
      history: scoped.filter((m) => m.status === "sent" || m.status === "skipped").filter((m) => may(v, m)).map(toRow),
      companies: names.filter((c) => v.advisor || c.id === v.clientId).map((c) => ({ ...c, mode: d.modes[c.id] ?? "off" })),
      benDigest: v.advisor ? d.benDigest : undefined,
    };
  },
  async view(v: Viewer, id: string): Promise<Res<{ mail: OutRow & { text: string } }>> {
    if (LIVE) return post({ action: "view", clientId: v.clientId, id });
    const m = load().mails.find((x) => x.id === id);
    if (!m || !may(v, m)) return { ok: false, reason: "not_found" };
    return { ok: true, mail: { ...toRow(m), html: m.html, text: m.text } };
  },
  async decide(v: Viewer, ids: string[], send: boolean): Promise<Res<{ sent?: number; skipped?: number; failed?: number }>> {
    if (LIVE) return post({ action: send ? "send" : "skip", clientId: v.clientId, ids });
    const d = load();
    let n = 0;
    d.mails = d.mails.map((m) => (ids.includes(m.id) && m.status === "held" && may(v, m) ? (n++, { ...m, status: send ? "sent" : "skipped", doneAt: new Date().toISOString(), doneBy: v.name }) : m));
    store(d);
    return send ? { ok: true, sent: n, failed: 0 } : { ok: true, skipped: n };
  },
  async mode(v: Viewer, clientId: string, mode: OutboxMode): Promise<Res<{ mode: OutboxMode }>> {
    if (LIVE) return post({ action: "mode", clientId, mode });
    const d = load();
    d.modes[clientId] = mode;
    store(d);
    return { ok: true, mode };
  },
  async digest(on: boolean): Promise<Res<{ benDigest: boolean }>> {
    if (LIVE) return post({ action: "digest", on });
    const d = load();
    d.benDigest = on;
    store(d);
    return { ok: true, benDigest: on };
  },
};

// how many are waiting, for the nav badge (per scope, refreshed at most once a minute)
type V = { advisor: boolean; clientId?: string; name: string };
const keyOf = (v: V) => `${v.advisor ? "a" : "e"}:${v.clientId ?? ""}`;
const cached = new Map<string, { at: number; n: number }>();
const subs = new Set<{ key: string; set: (n: number) => void }>();
export function setHeldCount(v: V, n: number) {
  const key = keyOf(v);
  cached.set(key, { at: Date.now(), n });
  subs.forEach((s) => s.key === key && s.set(n));
}
export function useHeldCount(v: V | null, names: { id: string; name: string }[]) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!v) return;
    const sub = { key: keyOf(v), set: setN };
    subs.add(sub);
    const c = cached.get(sub.key);
    if (c && Date.now() - c.at < 60_000) setN(c.n);
    else if (LIVE) post<{ count: number }>({ action: "count", clientId: v.clientId }).then((r) => r.ok && setHeldCount(v, r.count));
    else outboxApi.list(v, names).then((r) => r.ok && setHeldCount(v, r.held.length));
    return () => { subs.delete(sub); };
  }, [v?.advisor, v?.clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  return n;
}
