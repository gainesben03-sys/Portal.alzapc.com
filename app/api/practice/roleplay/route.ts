// Practice a hard conversation. Claude plays the employee; when the manager is done, Claude
// switches to coach and gives feedback against the training's framework (CLEAR, for example).
// Nothing from the conversation is saved.
//
// POST { clientId, resourceId?, scenarioId?, custom?: { name, role, situation }, lang, messages, feedback? }
//   -> { reply, done } or { feedback }

import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { claude, cleanChat, clip, logUsage, parseJson, tidy, underLimit } from "@/lib/ai";
import { DEFAULT_IDEAS, KeyIdea, PracticeContent, Scenario } from "@/lib/practice";

export const maxDuration = 60;
type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_TURNS = 14;

function actor(s: Scenario, lang: string) {
  return `You are role-playing an employee so a manager can practice a hard conversation. Stay in character the whole time.

You are ${s.name}, ${s.role}.
The situation, from the manager's side: ${s.setup}
How to play ${s.name}: ${s.persona}

Rules:
- Talk like a real person at work: 1 to 3 short sentences, natural and specific, a little messy. No speeches.
- React to HOW the manager handles it. If they're calm, use facts and ask real questions, open up step by step. If they accuse, label, lecture, generalize ("always", "never") or threaten, get more defensive or shut down. Don't make it easy, don't make it impossible.
- Don't reveal everything at once. Share the real reason only when they ask and listen.
- If they reach a clear, specific agreement and a follow-up, wrap up naturally in character, and add [END] at the very end.
- ${lang === "es" ? "Speak natural, everyday Latin American Spanish." : "Speak English."}
- Never coach, never mention being an AI or a role-play, never use em dashes. If the manager writes something abusive or unsafe, stop and reply only: [END]`;
}

function coach(s: Scenario, ideas: KeyIdea[], framework: string, lang: string) {
  return `You coach managers after a practice conversation. Be warm, honest and specific, like a good HR partner. Never use em dashes. ${lang === "es" ? "Write the feedback in natural Latin American Spanish." : "Write in English."}

The practice: ${s.title}. ${s.setup}
What good looks like: ${s.goal}
The framework (${framework}):
${ideas.map((k) => `- ${k.label} ${k.title}: ${k.body}`).join("\n")}

Read the conversation (the manager is "Manager", the employee is "${s.name}"). For each step of the framework, mark "yes", "partly" or "no", with one short note that points to what the manager actually said. Quote them briefly where it helps. Then give 1 or 2 strengths, the one thing to try next time, and one line they said rewritten the way it could sound better (only if there's a line worth improving).

Answer with JSON only:
{"overall":"1 or 2 sentences","steps":[{"label":"C","title":"Calm","mark":"yes","note":"..."}],"strengths":["..."],"tryNext":"...","betterLine":{"said":"exact words they used","try":"a better version"}}`;
}

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
  const lang = b.lang === "es" ? "es" : "en";
  const db = admin();

  // the scenario: from a published training shared with this client, or one the manager described
  let scenario: Scenario | null = null;
  let ideas = DEFAULT_IDEAS;
  let framework = "CLEAR";
  if (b.resourceId) {
    const { data } = await db.from("resources").select("data").eq("id", String(b.resourceId)).maybeSingle();
    const r = data?.data as D | undefined;
    const shared = (r?.shares ?? []).some((s: D) => s.clientId === clientId);
    if (!r || (!me.advisor && (!shared || r.practice?.status !== "published"))) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    const c: PracticeContent | undefined = r.practice?.content?.[lang] ?? r.practice?.content?.en;
    if (c) {
      ideas = c.ideas?.length ? c.ideas : DEFAULT_IDEAS;
      framework = c.framework || framework;
      scenario = c.scenarios?.find((s) => s.id === b.scenarioId) ?? null;
    }
  }
  if (!scenario && b.custom) {
    const cu = b.custom as D;
    const name = clip(String(cu.name ?? "").trim() || (lang === "es" ? "tu empleado" : "Sam"), 40);
    scenario = {
      id: "custom",
      title: lang === "es" ? "Tu conversación" : "Your conversation",
      setup: clip(cu.situation, 2000),
      name,
      role: clip(String(cu.role ?? "").trim() || "a team member", 80),
      persona: "Realistic for this situation. A little defensive at first, with a side of the story the manager hasn't heard yet. Opens up if the manager stays calm, sticks to facts and listens. Will agree to something specific if asked clearly.",
      goal: "Stay calm, lead with facts, explore their side, agree on something specific, and set a follow-up.",
      opener: "",
    };
  }
  if (!scenario || !scenario.setup) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });

  // the conversation: the employee is "assistant", the manager is "user"
  const raw = Array.isArray(b.messages) ? (b.messages as D[]) : [];
  const turns = raw.filter((m) => m?.role === "user").length;
  if (turns > MAX_TURNS && !b.feedback) return NextResponse.json({ ok: true, reply: "", done: true });

  if (b.feedback) {
    if (turns < 1) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
    if (!me.advisor && !(await underLimit(db, me.email, "feedback"))) return NextResponse.json({ ok: false, reason: "limit" });
    const transcript = raw
      .slice(-MAX_TURNS * 2 - 1)
      .map((m) => `${m.role === "user" ? "Manager" : scenario!.name}: ${clip(String(m.text ?? "").replace(/\[END\]/g, ""), 1200)}`)
      .join("\n");
    const r = await claude({ system: coach(scenario, ideas, framework, lang), messages: [{ role: "user", content: `<conversation>\n${transcript}\n</conversation>\n\nGive the feedback as JSON.` }], maxTokens: 1500 });
    if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason });
    const fb = parseJson(r.text);
    if (!fb) return NextResponse.json({ ok: false, reason: "bad_answer" });
    if (!me.advisor) await logUsage(db, { email: me.email, clientId, kind: "feedback", ref: b.resourceId ? `${b.resourceId}:${scenario.id}` : "custom" });
    return NextResponse.json({ ok: true, feedback: tidy(fb) });
  }

  if (!me.advisor && !(await underLimit(db, me.email, "roleplay"))) return NextResponse.json({ ok: false, reason: "limit" });
  // the opener is shown in the browser; include it so Claude knows what "it" said
  const intro = lang === "es" ? "(Tu gerente te pidió que vinieras a hablar.)" : "(Your manager asked you to come talk.)";
  const withOpener = scenario.opener ? [{ role: "user", text: intro }, { role: "assistant", text: scenario.opener }, ...raw] : raw;
  const chat = cleanChat(
    withOpener.map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: String(m.text ?? "").replace(/\[END\]/g, "") })),
    MAX_TURNS,
    1200,
  );
  if (!chat) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  const messages = chat.map((m) => ({ role: m.role, content: m.text }));
  const r = await claude({ system: actor(scenario, lang), messages, maxTokens: 300 });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason });
  const done = /\[END\]/.test(r.text);
  const reply = tidy(r.text.replace(/\[END\]/g, "").trim());
  if (!me.advisor && turns === 1) await logUsage(db, { email: me.email, clientId, kind: "roleplay", ref: b.resourceId ? `${b.resourceId}:${scenario.id}` : "custom" });
  return NextResponse.json({ ok: true, reply, done });
}
