// Ben only: build practice from a training's slides or notes. Nothing is saved here;
// Ben reviews it in the library and publishes it himself.
//
// POST { id, text?, notes?, spanish? } -> { content: { en, es? }, langs, notes }

import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { extractText } from "@/lib/extract";
import { claude, clip, parseJson, tidy } from "@/lib/ai";
import { SEED_PRACTICE } from "@/lib/practice";

export const maxDuration = 300;
type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SYSTEM = `You turn a manager training (slides, speaker notes or a guide) into practice for the managers who took it. You work for Ben Gaines, a fractional HR consultant (AlzaHR). Managers will use this on their phones, alone, after the session.

Build from the training itself: its framework, its words, its examples and its scenarios. Don't invent a different framework. Plain, warm, direct, short. Never use em dashes. Not corporate, not AI-sounding.

Return:
- title: the training's short title (no client name).
- intro: 1 or 2 sentences on what this is about.
- framework: the name of the training's main model (an acronym like CLEAR, or a short name). If it has none, name the core skill in 1 to 3 words.
- ideas: 3 to 7 key ideas, in the training's order. label is the letter or number used in the training (or a 1-word tag). body is 1 or 2 sentences. Include instead/tryThis lines when the training has them (use its exact wording).
- quiz: 6 to 8 multiple-choice questions that test applying the ideas, not memorizing slides. 4 options each, one clearly right, wrong options realistic (things managers really do). why: one sentence.
- sort: an optional quick sorting drill if the training contrasts two things (fact vs story, behavior vs label, coaching vs telling). 6 to 10 items, about half each, with a short why. Omit if it doesn't fit.
- scenarios: role-play scenarios from the training (use its scenarios and names). For each: id (short slug), title, setup (what the manager reads, 2 to 4 sentences), name, role, persona (how the employee behaves, what they really feel, the hidden reason they share only if asked well, how they react to good vs poor handling, what they'll agree to), goal (what good looks like, tied to the framework), opener (the employee's first line). 2 to 4 scenarios. If the training has none, write 2 realistic ones for this audience.
- pushback: 0 to 5 hard things employees say, each with a calm reply, from the training if it has them.
- planner: the training's planning questions for a real conversation, or 4 to 6 good ones.
- If the training is bilingual or Ben asks for Spanish, also return the same content in natural, warm Latin American Spanish under "es" (same ids, same order, same correct answers; use the training's own Spanish wording where it has it). Persona text can stay in English.

Answer with JSON only:
{"bilingual":true,"en":{"title":"","intro":"","framework":"","ideas":[{"label":"","title":"","body":"","instead":"","tryThis":""}],"quiz":[{"q":"","options":["","","",""],"answer":0,"why":""}],"sort":{"prompt":"","buckets":["",""],"items":[{"text":"","bucket":0,"why":""}]},"scenarios":[{"id":"","title":"","setup":"","name":"","role":"","persona":"","goal":"","opener":""}],"pushback":[{"line":"","reply":""}],"planner":[""]},"es":{...same shape...},"notes":"2 to 4 short lines for Ben: what you built from, anything you made up because the training didn't have it"}`;

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: true, demo: true, content: SEED_PRACTICE.content, langs: SEED_PRACTICE.langs, notes: "Demo: this is the practice built from the sample training." });
  const me = await caller(req);
  if (!me?.advisor) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  let b: D;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = admin();
  const { data } = await db.from("resources").select("data").eq("id", String(b.id ?? "")).maybeSingle();
  const r = data?.data as D | undefined;
  if (!r) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  let text = String(b.text ?? "").trim();
  if (!text && r.path && String(r.path).startsWith("alza/library/")) {
    const { data: file } = await db.storage.from("client-files").download(r.path);
    if (file) text = await extractText(Buffer.from(await file.arrayBuffer()), r.fileName ?? r.path, file.type ?? "").catch(() => "");
  }
  if (text.trim().length < 200) return NextResponse.json({ ok: false, reason: "no_text" });

  const user = `Training: ${r.title}${r.desc ? ` (${r.desc})` : ""}
${b.spanish ? "Ben wants a Spanish version too." : ""}${b.notes ? `\nBen's notes: ${clip(b.notes, 1500)}` : ""}

<training>
${clip(text, 120_000)}
</training>

Return the JSON.`;
  const out = await claude({ system: SYSTEM, messages: [{ role: "user", content: user }], maxTokens: 16000, temperature: 0.4 });
  if (!out.ok) return NextResponse.json({ ok: false, reason: out.reason, detail: out.detail });
  const j = parseJson(out.text);
  if (!j?.en?.ideas?.length || !j.en.scenarios?.length) return NextResponse.json({ ok: false, reason: "bad_answer" });
  const fix = (c: D) => ({
    ...c,
    quiz: (c.quiz ?? []).filter((q: D) => Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length),
    scenarios: (c.scenarios ?? []).map((s: D, i: number) => ({ ...s, id: String(s.id || `s${i + 1}`).replace(/[^a-z0-9-]/gi, "").slice(0, 30) || `s${i + 1}` })),
    sort: c.sort?.items?.length >= 4 ? { ...c.sort, items: c.sort.items.map((x: D) => ({ ...x, bucket: x.bucket ? 1 : 0 })) } : undefined,
  });
  const content: D = { en: tidy(fix(j.en)) };
  if ((j.bilingual || b.spanish) && j.es?.ideas?.length) content.es = tidy(fix(j.es));
  return NextResponse.json({ ok: true, content, langs: Object.keys(content), notes: tidy(String(j.notes ?? "")) });
}
