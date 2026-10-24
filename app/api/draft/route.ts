// Claude drafting for Ben (advisor only).
// The app sends only IDs. Context is loaded here, on the server, from ONE client's
// records, so nothing from another client can end up in a draft.
//
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional, default claude-sonnet-5-5)

import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export const maxDuration = 60;

type Mode = "reply" | "document";

const VOICE = `You draft for Ben Gaines, a fractional HR consultant who runs AlzaHR. His clients are small and growing companies, mostly in California.

How Ben writes:
- Short, plain, warm and direct. Sounds like a person, not a template.
- No corporate filler ("I hope this finds you well", "please don't hesitate"), no exclamation-heavy enthusiasm.
- Never use em dashes. Use commas, periods or colons instead.
- Gets to the answer first, then the why, then the next step.

Rules:
- Use only facts from the client context below or the request. Never invent names, dates, numbers, policy details or what the client has already done.
- If something needed is missing, leave a clear placeholder in [square brackets] for Ben to fill in.
- You are not giving legal advice. When the topic touches terminations, leaves of absence, discrimination, harassment, accommodations, wage and hour, or investigations, keep the client-facing text measured and add a caution for Ben.
- When state law matters, assume California only if the context points there, and say so in the notes for Ben.

Output format, exactly:
<draft>
(the text Ben would send or share, ready to edit)
</draft>
<for_ben>
(2 to 5 short bullet points only Ben sees: assumptions you made, what to double check, any risk flags. Write "None" if nothing.)
</for_ben>`;

function clip(s: unknown, n: number) {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "..." : t;
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key" });
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me?.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

  let b: { clientId?: string; mode?: Mode; noteId?: string; actionId?: string; instructions?: string; previous?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = String(b.clientId ?? "");
  const mode: Mode = b.mode === "reply" ? "reply" : "document";
  const db = admin();

  const [client, members, notes, actions, projects, files, resources] = await Promise.all([
    db.from("clients").select("id, name, engagement").eq("id", clientId).maybeSingle(),
    db.from("members").select("name, role, access").eq("client_id", clientId),
    db.from("notes").select("id, data, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(15),
    db.from("actions").select("id, data").eq("client_id", clientId),
    db.from("projects").select("data").eq("client_id", clientId),
    db.from("files").select("data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    db.from("resources").select("data"),
  ]);
  if (!client.data) return NextResponse.json({ ok: false, reason: "no_client" }, { status: 404 });

  type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const A: D[] = (actions.data ?? []).map((r) => ({ id: r.id, ...(r.data as D) }));
  const N: D[] = (notes.data ?? []).map((r) => ({ id: r.id, ...(r.data as D) }));
  const shared = (resources.data ?? [])
    .map((r) => r.data as D)
    .filter((r) => (r.shares ?? []).some((s: D) => s.clientId === clientId))
    .map((r) => `${r.title} (${r.type})`);

  const context = [
    `Client: ${client.data.name}${client.data.engagement ? ` (engagement: ${client.data.engagement})` : ""}`,
    `Their people: ${(members.data ?? []).map((m) => `${m.name}, ${m.role}`).join("; ") || "none listed"}`,
    `Active projects: ${(projects.data ?? []).map((p) => p.data as D).filter((p) => p.status !== "done").map((p) => `${p.name} (${p.status}): ${clip(p.summary, 120)}`).join("; ") || "none"}`,
    `Open tasks: ${A.filter((a) => a.status !== "completed").slice(0, 15).map((a) => `${a.title} [${a.side === "alza" ? "Ben owes" : `owner ${a.owner?.name}`}, due ${a.due}]`).join("; ") || "none"}`,
    `Recent notes: ${N.slice(0, 8).map((n) => `${n.author?.name}: ${clip(n.text, 200)}${(n.replies ?? []).length ? ` / Ben replied: ${clip(n.replies[n.replies.length - 1].text, 150)}` : ""}`).join(" | ") || "none"}`,
    `Files they've shared: ${(files.data ?? []).map((f) => (f.data as D).name).slice(0, 12).join(", ") || "none"}`,
    `Resources Ben has shared with them: ${shared.join(", ") || "none"}`,
  ].join("\n");

  let task = "";
  if (mode === "reply") {
    const n = N.find((x) => x.id === b.noteId);
    if (!n) return NextResponse.json({ ok: false, reason: "no_note" }, { status: 404 });
    task = `Draft Ben's reply on the client note board.

Note from ${n.author?.name} (${n.author?.role}), type ${n.kind}${n.urgent ? ", marked time-sensitive" : ""}:
"${clip(n.text, 2000)}"
${(n.replies ?? []).length ? `\nThread so far:\n${n.replies.map((r: D) => `${r.by}: ${clip(r.text, 400)}`).join("\n")}` : ""}

Keep it to a few sentences unless the question truly needs more. Address them by first name. Sign off as "Ben".`;
  } else {
    const a = A.find((x) => x.id === b.actionId);
    task = `Draft a document or written deliverable for this client.
${a ? `\nIt's for this task: "${a.title}"${a.detail ? `\nDetails: ${clip(a.detail, 1000)}` : ""}${a.subtasks?.length ? `\nSteps: ${a.subtasks.map((s: D) => s.text).join("; ")}` : ""}` : ""}
${b.instructions ? `\nBen's instructions: ${clip(b.instructions, 2000)}` : ""}

Write the complete document in clean, professional HR formatting: a title, short sections with plain headings, and simple language a small-company CEO can act on. No legalese unless the document type requires it.`;
  }
  if (b.previous && b.instructions && mode === "reply") task += `\n\nBen's instructions for this version: ${clip(b.instructions, 1000)}`;
  if (b.previous) task += `\n\nPrevious draft to improve on:\n${clip(b.previous, 6000)}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: mode === "reply" ? 1000 : 4000,
      system: `${VOICE}\n\n<client_context>\n${context}\n</client_context>`,
      messages: [{ role: "user", content: task }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json({ ok: false, reason: `api_${r.status}`, detail: clip(t, 300) });
  }
  const j = await r.json();
  const text: string = (j.content ?? []).filter((c: D) => c.type === "text").map((c: D) => c.text).join("\n");
  const draft = (text.match(/<draft>([\s\S]*?)<\/draft>/)?.[1] ?? text).trim().replace(/—/g, ", ");
  const forBen = (text.match(/<for_ben>([\s\S]*?)<\/for_ben>/)?.[1] ?? "").trim();
  return NextResponse.json({ ok: true, draft, forBen: /^none\.?$/i.test(forBen) ? "" : forBen });
}
