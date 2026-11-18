// Alza Pulse: everything executives and HR do. POST { clientId, action, ... }:
//   list                          surveys (no answers) plus what's needed for recommendations
//   create { templateId? | survey }   a new draft from the library or the AI builder
//   save { survey }               edit a draft (or the title/close date of an open one)
//   delete { id }                 remove a draft, or a survey with its answers
//   launch { id }                 invite everyone in the audience and open it
//   remind { id }                 email everyone who hasn't answered (you never see who)
//   close { id } / reopen { id, closesAt }
//   results { id }                numbers and comments (names removed); hidden under 5 answers
//   analyze { id }                AI insight: what it says, suggests, can't conclude, and what to do
//   actions { id, actions }       save the action plan
//   ai { op: build, prompt } | { op: bias, questions } | { op: message, id }
import { NextResponse } from "next/server";
import { logUsage, underLimit } from "@/lib/ai";
import { newToken } from "@/lib/perform";
import { cleanActions, cleanSurvey, fromTemplate, templateById, today, type Survey } from "@/lib/pulse";
import {
  analyze, biasReview, buildSurvey, employeeMessage, getSurvey, isAdmin, launch, listSurveys, loadCtx, newId, putSurvey, remind, results, tableReady,
} from "@/lib/pulseserver";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!isAdmin(who, clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  const x = await loadCtx(db, clientId);
  if (!x) return json({ ok: false, reason: "not_found" }, 404);
  if (!x.cfg.modules?.pulse) return json({ ok: false, reason: "off" }, 403);
  if (!(await tableReady(db))) return json({ ok: false, reason: "setup" }, 503);
  const by = who.name || who.email;
  const action = String(b.action ?? "");
  const one = async () => getSurvey(db, String(b.id ?? ""), clientId);

  try {
    if (action === "list") {
      const surveys = await listSurveys(db, clientId);
      return json({ ok: true, surveys, today: today() });
    }

    if (action === "create") {
      const t = templateById(String(b.templateId ?? ""));
      const base = fromTemplate(t ?? { id: "", title: "New survey", blurb: "", minutes: 3, intro: "", questions: [] }, clientId, by, newToken(), newId());
      const s = t ? base : cleanSurvey({ ...(b.survey as Partial<Survey>) }, { ...base, templateId: undefined });
      if (!(await putSurvey(db, s))) return json({ ok: false, reason: "save_failed" }, 500);
      return json({ ok: true, survey: s });
    }

    if (action === "save") {
      const cur = await getSurvey(db, String((b.survey as Survey)?.id ?? ""), clientId);
      if (!cur) return json({ ok: false, reason: "not_found" }, 404);
      const raw = b.survey as Partial<Survey>;
      // once people are answering, the questions are locked so results stay comparable
      const next = cur.status === "draft" ? cleanSurvey(raw, cur) : { ...cur, title: cleanSurvey(raw, cur).title, closesAt: cleanSurvey(raw, cur).closesAt };
      if (!(await putSurvey(db, next))) return json({ ok: false, reason: "save_failed" }, 500);
      return json({ ok: true, survey: next });
    }

    const s = await one();
    if (!s && action !== "ai") return json({ ok: false, reason: "not_found" }, 404);

    if (action === "delete" && s) {
      await db.from("pulse_surveys").delete().eq("id", s.id).eq("client_id", clientId);
      return json({ ok: true });
    }
    if (action === "launch" && s) {
      if (!s.questions.length) return json({ ok: false, reason: "no_questions" }, 400);
      if (s.closesAt < today()) return json({ ok: false, reason: "close_date" }, 400);
      const r = await launch(x, s);
      return json({ ok: true, ...r });
    }
    if (action === "remind" && s) {
      if (s.status !== "open") return json({ ok: false, reason: "not_open" }, 400);
      return json({ ok: true, sent: await remind(x, s) });
    }
    if (action === "close" && s) {
      const next: Survey = { ...s, status: "closed", closedAt: new Date().toISOString() };
      await putSurvey(db, next);
      return json({ ok: true, survey: next });
    }
    if (action === "reopen" && s) {
      const closesAt = /^\d{4}-\d{2}-\d{2}$/.test(String(b.closesAt)) && String(b.closesAt) >= today() ? String(b.closesAt) : s.closesAt;
      if (closesAt < today()) return json({ ok: false, reason: "close_date" }, 400);
      const next: Survey = { ...s, status: "open", closesAt, closedAt: undefined };
      await putSurvey(db, next);
      return json({ ok: true, survey: next });
    }
    if (action === "results" && s) {
      const r = await results(x, s, await listSurveys(db, clientId));
      return json({ ok: true, ...r });
    }
    if (action === "analyze" && s) {
      if (!(await underLimit(db, who.email, "pulse"))) return json({ ok: false, reason: "limit" }, 429);
      const { summary } = await results(x, s, await listSurveys(db, clientId));
      if (summary.hidden) return json({ ok: false, reason: "too_few" }, 400);
      const a = await analyze(x, s, summary);
      if (!a) return json({ ok: false, reason: "ai" }, 502);
      const next = { ...s, analysis: a };
      await putSurvey(db, next);
      await logUsage(db, { email: who.email, clientId, kind: "pulse", ref: s.id });
      return json({ ok: true, survey: next });
    }
    if (action === "actions" && s) {
      const next = { ...s, actions: cleanActions(b.actions) };
      await putSurvey(db, next);
      return json({ ok: true, survey: next });
    }
    if (action === "message" && s) {
      const next = { ...s, message: typeof b.message === "string" ? b.message.slice(0, 4000) : s.message };
      await putSurvey(db, next);
      return json({ ok: true, survey: next });
    }
    if (action === "ai") {
      if (!(await underLimit(db, who.email, "pulse"))) return json({ ok: false, reason: "limit" }, 429);
      const op = String(b.op ?? "");
      let out: object | null = null;
      if (op === "build") {
        const prompt = String(b.prompt ?? "").trim();
        if (prompt.length < 10) return json({ ok: false, reason: "bad_request" }, 400);
        const r = await buildSurvey(prompt);
        out = r && { draft: r };
      } else if (op === "bias") {
        const qs = cleanSurvey({ questions: b.questions as Survey["questions"] }, { ...fromTemplate({ id: "", title: "", blurb: "", minutes: 1, intro: "", questions: [] }, clientId, by, "", "x") }).questions;
        const r = await biasReview(qs);
        out = r && { issues: r };
      } else if (op === "message" && s) {
        const r = await employeeMessage(x, s);
        out = r ? { message: r } : null;
      } else return json({ ok: false, reason: "bad_request" }, 400);
      if (!out) return json({ ok: false, reason: "ai" }, 502);
      await logUsage(db, { email: who.email, clientId, kind: "pulse", ref: op });
      return json({ ok: true, ...out });
    }
  } catch (e) {
    return json({ ok: false, reason: e instanceof Error && e.message === "save_failed" ? "save_failed" : "error" }, 500);
  }
  return json({ ok: false, reason: "bad_request" }, 400);
}
