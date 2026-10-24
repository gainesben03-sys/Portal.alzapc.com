// Claude drafting for Ben (advisor only).
// The app sends only IDs. Context is loaded here, on the server, from ONE client's
// records, so nothing from another client can end up in a draft.
//
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional, default claude-sonnet-5-5)

import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export const maxDuration = 300;

type Mode = "reply" | "document" | "hire_doc";

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

  let b: { clientId?: string; mode?: Mode; noteId?: string; actionId?: string; hireId?: string; docType?: "offer" | "agreement"; instructions?: string; previous?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = String(b.clientId ?? "");
  const mode: Mode = b.mode === "reply" ? "reply" : b.mode === "hire_doc" ? "hire_doc" : "document";
  const db = admin();

  const [client, members, notes, actions, projects, files, resources, kn] = await Promise.all([
    db.from("clients").select("id, name, engagement").eq("id", clientId).maybeSingle(),
    db.from("members").select("name, role, access").eq("client_id", clientId),
    db.from("notes").select("id, data, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(15),
    db.from("actions").select("id, data").eq("client_id", clientId),
    db.from("projects").select("data").eq("client_id", clientId),
    db.from("files").select("data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    db.from("resources").select("data"),
    db.from("knowledge").select("title, kind, text, client_id").or(`client_id.eq.${clientId},client_id.is.null`).neq("kind", "letterhead"),
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
  } else if (mode === "hire_doc") {
    const { data: hr } = await db.from("hires").select("data, client_id").eq("id", String(b.hireId ?? "")).maybeSingle();
    if (!hr || hr.client_id !== clientId) return NextResponse.json({ ok: false, reason: "no_hire" }, { status: 404 });
    const h = hr.data as D;
    const isOffer = b.docType !== "agreement";
    const pay = h.payType === "hourly" ? `$${Number(h.payAmount).toFixed(2)} per hour (hourly, paid bi-weekly unless the template says otherwise)` : `$${Number(h.payAmount).toLocaleString("en-US")} per year (salary)`;
    task = `${isOffer ? "Prepare the OFFER LETTER" : "Prepare the EMPLOYMENT AGREEMENT"} for this new hire at ${client.data.name}.

Hire details (use exactly these, nothing invented):
- Legal name: ${h.name}${h.firstName ? ` (goes by ${h.firstName})` : ""}
- Position title: ${h.title}
- Reports to: ${h.managerName}, ${h.managerTitle}
- Classification: ${h.exempt === "nonexempt" ? "Non-exempt" : "Exempt"}, ${h.payType}
- Pay: ${pay}
- Bonus: ${h.bonus !== "" && h.bonus != null ? `${h.bonus}% target` : "none stated"}
- Start date: ${h.startDate}
- Work location: ${h.location || "[work location]"}
- Letter date: ${h.letterDate || new Date().toISOString().slice(0, 10)}
- Respond by: ${h.respondBy || "two days after the letter date"}
${h.contingencies ? `- Contingencies: ${h.contingencies}\n` : ""}${h.jd ? `- Job description (use for any job description exhibit or attachment):\n${clip(h.jd, 4000)}\n` : ""}${h.notes ? `- Notes from HR: ${clip(h.notes, 800)}\n` : ""}
How to do it:
- If the client has a ${isOffer ? "offer letter" : "employment agreement or contract"} template, reproduce it in full and only change the hire-specific details (names, title, manager, pay, dates, bonus, classification, job description). Keep every other sentence exactly as written. Write amounts the way the template does (for example words and numerals).
- If there is no client template but Ben has one, use Ben's.
- If neither exists, write a clean, professional ${isOffer ? "offer letter (at-will, contingent on employment eligibility verification, with a signature block for the hire to accept)" : "employment agreement suitable for a small California employer"} and say so in the notes for Ben.
- Leave anything unknown as a [bracketed placeholder].
- Format with simple markdown: # for the title, ## for section headings, - for bullets. No letterhead text; the letterhead is added separately.
- In the notes for Ben, list every value you filled in so he can check them, and flag anything that looks off (for example an exempt salary below the state minimum).`;
  } else {
    const a = A.find((x) => x.id === b.actionId);
    task = `Draft a document or written deliverable for this client.
${a ? `\nIt's for this task: "${a.title}"${a.detail ? `\nDetails: ${clip(a.detail, 1000)}` : ""}${a.subtasks?.length ? `\nSteps: ${a.subtasks.map((s: D) => s.text).join("; ")}` : ""}` : ""}
${b.instructions ? `\nBen's instructions: ${clip(b.instructions, 2000)}` : ""}

Write the complete document in clean, professional HR formatting: a title, short sections with plain headings, and simple language a small-company CEO can act on. No legalese unless the document type requires it.`;
  }
  if (b.previous && b.instructions && mode === "reply") task += `\n\nBen's instructions for this version: ${clip(b.instructions, 1000)}`;
  if (b.previous) task += `\n\nPrevious draft to improve on:\n${clip(b.previous, 6000)}`;

  // ---- pick the documents most relevant to this request (client's own first, then Ben's templates)
  const words = (task + " " + (b.instructions ?? "")).toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const wanted = new Set(words);
  const docs = (kn.data ?? [])
    .filter((d) => (d.text ?? "").length > 0)
    .map((d) => {
      const titleWords = String(d.title).toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const overlap = titleWords.filter((w) => wanted.has(w)).length;
      const own = d.client_id ? 10 : 0;
      const kindScore = mode === "reply" ? (d.kind === "handbook" || d.kind === "policy" ? 6 : 1) : d.kind === "template" ? 6 : d.kind === "handbook" || d.kind === "policy" ? 4 : 1;
      const docTypeBoost = mode === "hire_doc" && d.kind === "template" && (b.docType === "agreement" ? /agreement|contract|employment/i : /offer/i).test(String(d.title)) ? 30 : 0;
      return { ...d, score: own + kindScore + overlap * 5 + docTypeBoost };
    })
    .sort((x, y) => y.score - x.score);
  let budget = 90_000;
  const used: { title: string; own: boolean }[] = [];
  const docText: string[] = [];
  for (const d of docs) {
    if (budget < 2_000) break;
    const cap = Math.min(budget, d.kind === "handbook" ? 45_000 : 20_000);
    const t = String(d.text).slice(0, cap);
    budget -= t.length;
    used.push({ title: d.title, own: !!d.client_id });
    docText.push(`<document title="${String(d.title).replace(/"/g, "'")}" source="${d.client_id ? "client" : "ben_template"}" type="${d.kind}">\n${t}${String(d.text).length > cap ? "\n[truncated]" : ""}\n</document>`);
  }
  const docRules = docText.length
    ? `\n\nDocuments you have (client documents override Ben's templates):\n- If one of the CLIENT's documents covers the topic, follow it exactly: its policies, numbers, defined terms, structure and tone. Cite the section in the notes for Ben. Never contradict it; if it seems outdated or noncompliant, draft per the document and flag it for Ben.\n- If only one of BEN's templates applies, follow its structure and wording, adapted to this client.\n- If nothing applies, use current best practice and say so.\n- In the notes for Ben, always start with a line "Based on: ..." naming the documents you used, or "Based on: best practice (no matching document)".`
    : `\n\nThere are no uploaded documents for this client yet. Draft from current best practice, and start the notes for Ben with "Based on: best practice (no client documents uploaded)".`;

  const system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] = [
    { type: "text", text: VOICE + docRules },
    ...(docText.length ? [{ type: "text" as const, text: `<documents>\n${docText.join("\n\n")}\n</documents>`, cache_control: { type: "ephemeral" as const } }] : []),
    { type: "text", text: `<client_context>\n${context}\n</client_context>` },
  ];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: mode === "reply" ? 1000 : mode === "hire_doc" ? 8000 : 4000,
      system,
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
  return NextResponse.json({ ok: true, draft, forBen: /^none\.?$/i.test(forBen) ? "" : forBen, used });
}
