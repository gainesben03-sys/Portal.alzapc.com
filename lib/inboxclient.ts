"use client";

// Ben's email inbox in the browser. Live: /api/inbox (advisors only). Demo: runs here with made-up emails,
// and "Add" writes the project and tasks into the demo portal so you can see them land.
import { Action, Project } from "./data";
import { buildWork, InboxItem, SENSITIVE, stepsFor, WorkType } from "./inbox";
import { authHeader, LIVE } from "./supabase";

type Res = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const KEY = "alza-demo-inbox-v1";
export type InboxDemo = { clients: { id: string; name: string }[]; apply: (w: { project?: Project; actions: Action[] }) => void };

function guess(text: string): { type: WorkType; title: string; person?: string } {
  const t = text.toLowerCase();
  const name = /\b(?:for|about|letting go of|terminate|terminating|hire|hiring)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/.exec(text)?.[1];
  const type: WorkType = /terminat|let(ting)? (him|her|them|.+) go|separation|last day/.test(t) ? "termination"
    : /complain|harass|investigat|misconduct/.test(t) ? "investigation"
    : /\bleave\b|maternity|paternity|medical|fmla|cfra|pdl/.test(t) ? "leave"
    : /offer letter|\boffer\b/.test(t) ? "offer"
    : /job description|job posting|\bjd\b/.test(t) ? "jd"
    : /new hire|onboard|starting on|start date/.test(t) ? "newhire"
    : /policy|handbook|procedure/.test(t) ? "policy" : "other";
  const label: Record<WorkType, string> = { offer: "Offer letter", termination: "Termination", newhire: "Onboard", jd: "Job description", investigation: "Investigation intake", leave: "Leave", policy: "Policy update", other: "Follow up" };
  return { type, title: name ? `${label[type]}${type === "policy" || type === "other" ? ":" : " for"} ${name}` : label[type], person: name };
}

function seed(clients: InboxDemo["clients"]): InboxItem[] {
  const c = clients[0]?.id;
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 36e5).toISOString();
  const base = { via: "email" as const, from: "ben@alzapc.com", attachments: [], trusted: true };
  return [
    { ...base, id: "in-demo-1", clientId: c, receivedAt: at(2), origFrom: "Alex Morgan <alex@harborlight.example>", subject: "Fwd: Offer for our new event coordinator", text: "---------- Forwarded message ---------\nFrom: Alex Morgan <alex@harborlight.example>\n\nHi Ben, we'd like to make an offer to Jamie Rivera for Event Coordinator, $68,000, starting December 1. Can you put the offer letter together by Friday?", type: "offer", sensitive: false, title: "Offer letter for Jamie Rivera", summary: "Alex wants an offer for Jamie Rivera, Event Coordinator at $68,000, starting Dec 1. Letter needed by Friday.", person: "Jamie Rivera", steps: stepsFor("offer"), status: "review", why: "Demo: press Add to see the project and your tasks appear." },
    { ...base, id: "in-demo-2", clientId: c, receivedAt: at(26), origFrom: "Alex Morgan <alex@harborlight.example>", subject: "Fwd: Need to talk about Sam", text: "---------- Forwarded message ---------\nFrom: Alex Morgan\n\nBen, after the last two write-ups we've decided to let Sam go. Can we plan for next Thursday?", type: "termination", sensitive: true, title: "Termination for Sam", summary: "Alex has decided to let Sam go after two write-ups and wants to plan for next Thursday.", person: "Sam", steps: stepsFor("termination"), status: "private" },
    { ...base, id: "in-demo-3", receivedAt: at(50), origFrom: "Pat Lee <pat@newprospect.example>", subject: "Fwd: Quick question on PTO carryover", text: "From: Pat Lee <pat@newprospect.example>\n\nDo we have to let people carry over unused PTO in California?", type: "other", sensitive: false, title: "PTO carryover question", summary: "Pat asks whether unused PTO has to carry over in California.", steps: [], status: "unsorted", why: "Couldn't tell which client this is for." },
  ];
}
function load(clients: InboxDemo["clients"]): InboxItem[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch {}
  const s = seed(clients); save(s); return s;
}
function save(s: InboxItem[]) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export async function inboxApi(body: Res, demo?: InboxDemo): Promise<Res> {
  if (LIVE) {
    try {
      const r = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
      return await r.json();
    } catch { return { ok: false, reason: "network" }; }
  }
  if (!demo) return { ok: false, reason: "demo" };
  const list = load(demo.clients);
  const a = String(body.action);
  const find = () => list.find((x) => x.id === body.id);
  const done = (out: Res) => { save(list); return { ok: true, demo: true, ...out }; };
  if (a === "list") return { ok: true, demo: true, items: list };
  if (a === "paste") {
    await new Promise((r) => setTimeout(r, 900));
    const text = String(body.text ?? "");
    const g = guess(`${body.subject ?? ""}\n${text}`);
    const named = demo.clients.find((c) => text.toLowerCase().includes(c.name.toLowerCase().split(/\s+/)[0]));
    const clientId = (body.clientId as string) || named?.id;
    const sensitive = SENSITIVE.includes(g.type);
    let it: InboxItem = { id: `in${Date.now().toString(36)}`, clientId, receivedAt: new Date().toISOString(), via: "paste", from: "ben@alzapc.com", subject: String(body.subject || "(pasted email)"), text, attachments: [], type: g.type, sensitive, title: g.title, summary: text.replace(/\s+/g, " ").slice(0, 180), person: g.person, steps: stepsFor(g.type), status: "review", trusted: true };
    if (!clientId) it = { ...it, status: "unsorted", why: "Couldn't tell which client this is for." };
    else if (sensitive) it.status = "private";
    else { const w = buildWork(it); demo.apply(w); it = { ...it, status: "created", made: { projectId: w.project?.id, actionIds: w.actions.map((x) => x.id) } }; }
    list.unshift(it);
    return done({ item: it });
  }
  const it = find();
  if (!it) return { ok: false, reason: "not_found" };
  if (a === "update") {
    const p = (body.patch ?? {}) as Partial<InboxItem>;
    Object.assign(it, p.type && p.type !== it.type && it.status !== "created" ? { steps: stepsFor(p.type) } : {}, p);
    if (it.status === "unsorted" && it.clientId) { it.status = it.sensitive ? "private" : "review"; it.why = it.sensitive ? undefined : "Ready to add."; }
    return done({ item: it });
  }
  if (a === "add") {
    if (!it.clientId) return { ok: false, reason: "client" };
    const w = buildWork(it);
    demo.apply(w);
    Object.assign(it, { status: "created", sensitive: false, why: undefined, made: { projectId: w.project?.id, actionIds: w.actions.map((x) => x.id) } });
    return done({ item: it });
  }
  if (a === "dismiss") { it.status = "dismissed"; return done({ item: it }); }
  if (a === "delete") { list.splice(list.indexOf(it), 1); return done({}); }
  return { ok: false, reason: "demo" };
}
