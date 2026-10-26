// Fill a past document (Ben only). Keeps the original Word file exactly as it is
// (letterhead, fonts, spacing, tables, footers) and swaps only the details that change.
//
//   POST { step: "propose", clientId, knowledgeId | file(base64), fileName?, hireId?, actionId?, instructions? }
//        -> { changes: [{find, replace, why, found}], notes, missing }
//   POST { step: "apply", clientId, knowledgeId | file(base64), fileName?, changes: [{find, replace}] }
//        -> { file(base64), fileName, applied: [{find, replace, count}] }
//
// Nothing is saved here. The app saves the result to the hire or task after Ben checks it.

import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { docxParagraphs, fillDocx, Replacement } from "@/lib/docxfill";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "client-files";
const MAX_FILE = 3_000_000; // request bodies on Vercel top out around 4.5 MB once base64 encoded

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const clip = (s: unknown, n: number) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "..." : t;
};
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ");

const SYSTEM = `You update a past HR document (offer letter, termination letter, promotion letter, warning, agreement) for a new person or situation, for Ben Gaines, a fractional HR consultant.

The document's formatting must stay exactly as it is, so you do NOT rewrite it. You only list find-and-replace pairs.

Rules:
- Change only details that belong to the old person or situation: names (full, first, last, Mr./Ms. forms), job title, department, manager and their title, pay and how it is written (words and numerals), bonus, dates (letter date, start date, last day, response deadline, effective date), location, address, reasons or facts specific to the old situation, and anything the new details or Ben's instructions say to change.
- Never change policy language, legal language, benefits descriptions, at-will language, signature blocks, or company boilerplate, unless Ben's instructions say to.
- Each "find" must be copied character for character from ONE paragraph of the document as given (same spelling, capitalization, punctuation). Keep it as short as possible while still unique enough not to hit unrelated text. Prefer whole phrases like "Jordan Kim" or "$68,000" over single common words.
- Every occurrence of a "find" in the document is replaced, so one pair covers repeats. List a full name before the first name alone.
- Match the document's style: if it writes "Sixty-Eight Thousand Dollars ($68,000.00)", the replacement does too. Keep date formats the same.
- Use only facts from the new details or Ben's instructions. If the document needs a value you don't have, do not guess: put the find in with replace "[NEW VALUE NEEDED: what]" and add it to "missing".
- If a whole sentence only made sense for the old situation (for example a relocation bonus the new person isn't getting), replace that sentence's text with the corrected sentence or with "" to remove it, and explain in "why".
- Never use em dashes.

Answer with JSON only, no other text:
{"changes":[{"find":"...","replace":"...","why":"old name -> new name"}],"notes":"1 to 4 short lines for Ben: what kind of document this is, what to double check, any risk (for example a final pay timing rule in a termination letter). Empty string if nothing.","missing":["values you need from Ben"]}`;

async function loadFile(db: ReturnType<typeof admin>, clientId: string, b: D): Promise<{ buf: Buffer; name: string } | { error: string }> {
  if (b.knowledgeId) {
    const { data } = await db.from("knowledge").select("client_id, path, file_name, title").eq("id", String(b.knowledgeId)).maybeSingle();
    if (!data || (data.client_id && data.client_id !== clientId)) return { error: "not_found" };
    if (!/\.docx$/i.test(String(data.file_name ?? data.path))) return { error: "not_docx" };
    const dl = await db.storage.from(BUCKET).download(data.path);
    if (dl.error || !dl.data) return { error: "not_found" };
    return { buf: Buffer.from(await dl.data.arrayBuffer()), name: String(data.file_name || data.title) };
  }
  if (b.file) {
    const name = String(b.fileName ?? "document.docx");
    if (!/\.docx$/i.test(name)) return { error: "not_docx" };
    const buf = Buffer.from(String(b.file), "base64");
    if (buf.length > MAX_FILE) return { error: "too_big" };
    return { buf, name };
  }
  return { error: "bad_request" };
}

async function newDetails(db: ReturnType<typeof admin>, clientId: string, b: D): Promise<string> {
  const lines: string[] = [];
  const { data: c } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
  if (c) lines.push(`Company: ${c.name}`);
  lines.push(`Today: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}`);
  if (b.hireId) {
    const { data: hr } = await db.from("hires").select("data, client_id").eq("id", String(b.hireId)).maybeSingle();
    if (hr && hr.client_id === clientId) {
      const h = hr.data as D;
      const pay = h.payAmount ? (h.payType === "hourly" ? `$${Number(h.payAmount).toFixed(2)} per hour` : `$${Number(h.payAmount).toLocaleString("en-US")} per year`) : "";
      lines.push(
        "New hire details:",
        `- Legal name: ${h.name}${h.firstName ? ` (goes by ${h.firstName})` : ""}`,
        `- Title: ${h.title || ""}`,
        `- Reports to: ${[h.managerName, h.managerTitle].filter(Boolean).join(", ")}`,
        `- Classification: ${h.exempt === "nonexempt" ? "Non-exempt" : "Exempt"}, ${h.payType || ""}`,
        pay && `- Pay: ${pay}`,
        h.bonus !== "" && h.bonus != null ? `- Bonus: ${h.bonus}% target` : "- Bonus: none stated",
        `- Start date: ${h.startDate || ""}`,
        h.location && `- Work location: ${h.location}`,
        h.letterDate && `- Letter date: ${h.letterDate}`,
        h.respondBy && `- Respond by: ${h.respondBy}`,
        h.contingencies && `- Contingencies: ${h.contingencies}`,
        h.notes && `- Notes from HR: ${clip(h.notes, 800)}`,
      );
    }
  }
  if (b.actionId) {
    const { data: a } = await db.from("actions").select("data, client_id").eq("id", String(b.actionId)).maybeSingle();
    if (a && a.client_id === clientId) {
      const t = a.data as D;
      lines.push(`It's for this task: "${t.title}"${t.detail ? `\nTask details: ${clip(t.detail, 1500)}` : ""}`);
    }
  }
  return lines.filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const me = await caller(req);
  if (!me?.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  let b: D;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = String(b.clientId ?? "");
  const db = admin();
  const f = await loadFile(db, clientId, b);
  if ("error" in f) return NextResponse.json({ ok: false, reason: f.error }, { status: f.error === "bad_request" ? 400 : 200 });

  let paras: string[];
  try {
    paras = await docxParagraphs(f.buf);
  } catch {
    return NextResponse.json({ ok: false, reason: "unreadable" });
  }
  if (!paras.length) return NextResponse.json({ ok: false, reason: "empty" });

  // ---------- apply: no Claude, just Ben's checked list
  if (b.step === "apply") {
    const reps: Replacement[] = (Array.isArray(b.changes) ? b.changes : [])
      .map((c: D) => ({ find: String(c.find ?? ""), replace: String(c.replace ?? "").replace(/—/g, ", ") }))
      .filter((c: Replacement) => c.find.trim() && c.find !== c.replace)
      .sort((x: Replacement, y: Replacement) => y.find.length - x.find.length); // "Jordan Kim" before "Jordan"
    const { file, applied } = await fillDocx(f.buf, reps);
    const base = f.name.replace(/\.docx$/i, "");
    return NextResponse.json({ ok: true, file: file.toString("base64"), fileName: `${base} (updated).docx`, applied });
  }

  // ---------- propose: Claude picks the swaps
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key" });
  const doc = paras.map((p, i) => `[${i + 1}] ${p}`).join("\n");
  const details = await newDetails(db, clientId, b);
  const user = `<document file="${f.name.replace(/"/g, "'")}">\n${clip(doc, 120_000)}\n</document>\n\n<new_details>\n${details}\n</new_details>${b.instructions ? `\n\n<ben_instructions>\n${clip(b.instructions, 3000)}\n</ben_instructions>` : ""}\n\nList the replacements as JSON.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
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
  const normParas = paras.map(norm);
  const seen = new Set<string>();
  const changes = (Array.isArray(out.changes) ? out.changes : [])
    .map((c: D) => ({ find: String(c.find ?? ""), replace: String(c.replace ?? "").replace(/—/g, ", "), why: String(c.why ?? "") }))
    .filter((c: { find: string; replace: string }) => c.find.trim() && c.find !== c.replace && !seen.has(c.find) && seen.add(c.find))
    .map((c: { find: string }) => {
      const n = norm(c.find);
      return { ...c, found: normParas.reduce((k, p) => k + (p.split(n).length - 1), 0) };
    });
  return NextResponse.json({
    ok: true,
    fileName: f.name,
    changes,
    notes: String(out.notes ?? "").replace(/—/g, ", ").trim(),
    missing: (Array.isArray(out.missing) ? out.missing : []).map(String).filter(Boolean),
  });
}
