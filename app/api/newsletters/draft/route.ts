// Claude writes a new month's newsletter into an existing issue's design (Ben only).
// The email's layout, colors and code stay exactly as they are: Claude only returns new wording
// for each numbered piece of text, and the server puts it back in place.
//
// POST { id, topic?, notes? } -> { html, subject, preview, topic, notes }   (nothing is saved here)

import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { joinEmail, segmentsForPrompt, splitEmail } from "@/lib/nlsegments";

export const maxDuration = 300;

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clip = (s: unknown, n: number) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "..." : t;
};
const KIND: Record<string, string> = {
  "manager-minute": "Manager Minute: a monthly email for the client's managers. One real situation they'll recognize, the words to use, leader-vs-manager contrasts, one compliance fact they should know, and one 5-minute move to try.",
  "the-pause": "The Pause: a monthly email for all staff. A short, warm idea about wellbeing or working well together, a couple of small things to try, and a little fun. Never preachy.",
  intro: "An introduction email.",
  other: "A newsletter.",
};

const SYSTEM = `You write monthly HR newsletters for Ben Gaines, a fractional HR consultant (AlzaHR). Each client gets the same newsletter design every month; you write the new month's words into it.

You get the email as numbered pieces of text, in reading order, plus links marked (link). Write a fresh issue on a NEW topic for the new month, fitting the client.

Rules:
- Return new text for the pieces that should change. Each piece keeps its role: a section label stays a short label, a headline stays a headline, a "Not that" line stays a "Not that" line, and so on. Keep each piece about the same length as the original (within about a third), because the layout is fixed.
- Repeated labels that are part of the design (for example "What to say", "Know this", "Your 5-minute move", "Not that:", "Say this:", the newsletter name, the company name) stay exactly as they are. Don't return them.
- Update the month and year wherever they appear.
- If a piece only made sense for a first issue (a welcome or "we're starting something new"), rewrite it as a short, friendly note for this month instead.
- Bilingual issues: the Spanish pieces must say the same thing as your new English pieces, in natural, warm Latin American Spanish (the same register as the original).
- Facts: only state a statistic, study or law you are confident is accurate and current. Compliance facts must match the client's states (California unless the context says otherwise; Blueprint is California and Nevada). If you cite something, change the matching source link to a real, stable official URL (government agency, the study's publisher). If you aren't sure of a figure, make the point without a number. A quote must be a real, well-known quote with the correct person; if you can't be sure, keep the original quote piece unchanged and say so in the notes.
- Plain, warm, direct. Not corporate, not AI-sounding. Never use em dashes.
- Don't change contact details (emails, names of the HR contacts) or the sign-off.

Answer with JSON only:
{"topic":"2 to 4 words","subject":"email subject line, same pattern as the original","preview":"inbox preview line","changes":{"<piece number>":"new text", "...": "..."},"notes":"2 to 5 short lines for Ben: what to double check (every stat, law and quote you used, with where it comes from), anything you left unchanged on purpose"}`;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key" });
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me?.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  let b: { id?: string; topic?: string; notes?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = admin();
  const { data: row } = await db.from("newsletters").select("id, client_id, data").eq("id", String(b.id ?? "")).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const n = row.data as D;

  const [client, past, ctx] = await Promise.all([
    db.from("clients").select("name, engagement").eq("id", row.client_id).maybeSingle(),
    db.from("newsletters").select("subject:data->>subject, month:data->>month, kind:data->>kind, topic:data->>topic").eq("client_id", row.client_id),
    db.from("knowledge").select("title, text").eq("client_id", row.client_id).eq("title", "Client context").limit(1),
  ]);
  const earlier = (past.data ?? [])
    .filter((p: D) => p.kind === n.kind && p.month <= n.month)
    .sort((a: D, c: D) => String(c.month).localeCompare(String(a.month)))
    .map((p: D) => `- ${p.month}: ${p.topic ? `${p.topic} (${p.subject})` : p.subject}`)
    .slice(0, 12);

  const split = splitEmail(String(n.html ?? ""));
  if (split.segs.length < 5) return NextResponse.json({ ok: false, reason: "empty" });
  const [y, m] = String(n.month).split("-").map(Number);
  const monthName = new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const user = `Client: ${client.data?.name ?? ""}${client.data?.engagement ? ` (${client.data.engagement})` : ""}
Newsletter: ${KIND[n.kind] ?? KIND.other}
Language: ${String(n.lang).includes("es") ? "English with a full Spanish version below it" : "English"}
New month: ${monthName}
${ctx.data?.[0]?.text ? `\nWhat Ben knows about this client:\n${clip(ctx.data[0].text, 3000)}\n` : ""}
Earlier issues for this client (don't repeat these topics):
${earlier.join("\n") || "- none"}
${b.topic ? `\nBen wants this month's topic to be: ${clip(b.topic, 300)}` : "\nPick a topic that fits the season and this client's world."}${b.notes ? `\nBen's notes: ${clip(b.notes, 1500)}` : ""}

The current email (last month's words, in this month's design):
<email>
${segmentsForPrompt(split.segs)}
</email>

Return the JSON.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 12000, system: SYSTEM, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json({ ok: false, reason: `api_${r.status}`, detail: clip(t, 300) });
  }
  const j = await r.json();
  const text: string = (j.content ?? []).filter((c: D) => c.type === "text").map((c: D) => c.text).join("\n");
  let out: D;
  try {
    out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_answer" });
  }
  const changes: Record<string, string> = {};
  for (const [k, v] of Object.entries(out.changes ?? {})) if (/^\d+$/.test(k) && Number(k) < split.segs.length && typeof v === "string") changes[k] = v;
  if (Object.keys(changes).length < 3) return NextResponse.json({ ok: false, reason: "bad_answer" });
  const dash = (s: unknown) => String(s ?? "").replace(/\s*—\s*/g, ", ").trim();
  return NextResponse.json({
    ok: true,
    html: joinEmail(split, changes),
    subject: dash(out.subject) || n.subject,
    preview: dash(out.preview),
    topic: dash(out.topic),
    notes: dash(out.notes),
    changed: Object.keys(changes).length,
  });
}
