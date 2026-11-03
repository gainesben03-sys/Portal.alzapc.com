"use client";

import { useEffect, useRef, useState } from "react";
import { authHeader } from "@/lib/supabase";
import { demoFeedback, demoReply, Feedback, KeyIdea, Lang, PracticeContent, QuizQ, Scenario, SortDrill, ui } from "@/lib/practice";

const REASON: Record<string, string> = {
  limit: "That's today's practice limit. Try again tomorrow.",
  no_key: "Practice isn't switched on yet. Ben is on it.",
  forbidden: "This practice isn't available to you.",
  not_found: "This practice isn't available any more.",
  signed_out: "Sign in again to keep practicing.",
};
const say = (reason?: string) => REASON[reason ?? ""] ?? "Something went wrong. Try that again.";

export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

/** The training's key ideas, one card each, with the "instead of / try" lines. */
export function IdeaCards({ c, lang }: { c: PracticeContent; lang: Lang }) {
  const t = ui(lang);
  return (
    <div className="pr-ideas">
      {c.ideas.map((k) => (
        <div className="card pr-idea" key={k.label + k.title}>
          <div className="pr-idea-head">
            <span className="pr-letter" aria-hidden="true">{k.label}</span>
            <b>{k.title}</b>
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>{k.body}</p>
          {(k.instead || k.tryThis) && (
            <div className="pr-swap">
              {k.instead && <div><span className="tiny muted">{t.instead}</span><span className="pr-not">“{k.instead}”</span></div>}
              {k.tryThis && <div><span className="tiny muted">{t.try}</span><span className="pr-yes">“{k.tryThis}”</span></div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** One question at a time, with the why after each answer. */
export function Quiz({ qs, lang, onDone }: { qs: QuizQ[]; lang: Lang; onDone?: (score: number, total: number) => void }) {
  const t = ui(lang);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [end, setEnd] = useState(false);
  useEffect(() => {
    setI(0); setPick(null); setRight(0); setEnd(false);
  }, [qs]);
  if (!qs.length) return null;
  if (end)
    return (
      <div className="card pr-end">
        <div className="pr-big">{right}/{qs.length}</div>
        <b>{t.score.replace("{n}", String(right)).replace("{t}", String(qs.length))}</b>
        <p className="small muted" style={{ margin: "6px 0 12px" }}>{right === qs.length ? (lang === "es" ? "Perfecto. Ahora pruébalo en voz alta en la práctica." : "Perfect. Now try it out loud in the role-play.") : right >= qs.length * 0.7 ? (lang === "es" ? "Muy bien. Repasa las que fallaste." : "Nice work. Look back at the ones you missed.") : lang === "es" ? "Repasa las ideas clave y vuelve a intentarlo." : "Have another look at the key ideas and try again."}</p>
        <button className="btn" onClick={() => { setI(0); setPick(null); setRight(0); setEnd(false); }}>{t.again}</button>
      </div>
    );
  const q = qs[i];
  const answered = pick !== null;
  return (
    <div className="card pr-quiz">
      <div className="pr-dots" aria-label={`${i + 1} / ${qs.length}`}>{qs.map((_, k) => <span key={k} className={k < i ? "done" : k === i ? "on" : ""} />)}</div>
      <b className="pr-q">{q.q}</b>
      <div className="pr-opts">
        {q.options.map((o, k) => (
          <button
            key={k}
            disabled={answered}
            className={`pr-opt ${answered && k === q.answer ? "right" : ""} ${answered && k === pick && k !== q.answer ? "wrong" : ""}`}
            onClick={() => { setPick(k); if (k === q.answer) setRight((n) => n + 1); }}
          >
            {o}
          </button>
        ))}
      </div>
      {answered && (
        <div className={`pr-why ${pick === q.answer ? "ok" : ""}`}>
          <b className="small">{pick === q.answer ? (lang === "es" ? "Así es." : "That's it.") : lang === "es" ? "No exactamente." : "Not quite."}</b> <span className="small">{q.why}</span>
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button className="btn primary sm" onClick={() => { if (i + 1 >= qs.length) { setEnd(true); onDone?.(right, qs.length); } else { setI(i + 1); setPick(null); } }}>{i + 1 >= qs.length ? (lang === "es" ? "Ver resultado" : "See my score") : t.next}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Quick sorting drill: fact or story, and so on. */
export function Sorter({ drill, lang, onDone }: { drill: SortDrill; lang: Lang; onDone?: (score: number, total: number) => void }) {
  const t = ui(lang);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<0 | 1 | null>(null);
  const [right, setRight] = useState(0);
  const [end, setEnd] = useState(false);
  useEffect(() => {
    setI(0); setPick(null); setRight(0); setEnd(false);
  }, [drill]);
  const items = drill.items;
  if (end)
    return (
      <div className="card pr-end">
        <div className="pr-big">{right}/{items.length}</div>
        <b>{t.score.replace("{n}", String(right)).replace("{t}", String(items.length))}</b>
        <div style={{ marginTop: 12 }}><button className="btn" onClick={() => { setI(0); setPick(null); setRight(0); setEnd(false); }}>{t.again}</button></div>
      </div>
    );
  const it = items[i];
  return (
    <div className="card pr-sort">
      <div className="pr-dots">{items.map((_, k) => <span key={k} className={k < i ? "done" : k === i ? "on" : ""} />)}</div>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{drill.prompt}</span>
      <div className="pr-sort-card">“{it.text}”</div>
      <div className="pr-sort-btns">
        {drill.buckets.map((bk, k) => (
          <button key={k} disabled={pick !== null} className={`btn ${pick !== null && k === it.bucket ? "pr-right" : ""} ${pick === k && k !== it.bucket ? "pr-wrong" : ""}`} onClick={() => { setPick(k as 0 | 1); if (k === it.bucket) setRight((n) => n + 1); }}>{bk}</button>
        ))}
      </div>
      {pick !== null && (
        <div className={`pr-why ${pick === it.bucket ? "ok" : ""}`}>
          <b className="small">{drill.buckets[it.bucket]}.</b> <span className="small">{it.why}</span>
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button className="btn primary sm" onClick={() => { if (i + 1 >= items.length) { setEnd(true); onDone?.(right, items.length); } else { setI(i + 1); setPick(null); } }}>{t.next}</button>
          </div>
        </div>
      )}
    </div>
  );
}

type Msg = { role: "user" | "assistant"; text: string };
export type Custom = { name: string; role: string; situation: string };

/** Claude plays the employee. When the manager is ready, it switches to coach and gives feedback. */
export function RolePlay({ clientId, resourceId, scenario, custom, lang, ideas, pushback, onExit }: { clientId: string; resourceId?: string; scenario?: Scenario; custom?: Custom; lang: Lang; ideas: KeyIdea[]; pushback?: { line: string; reply: string }[]; onExit: () => void }) {
  const t = ui(lang);
  const name = scenario?.name ?? custom?.name ?? "Sam";
  const [msgs, setMsgs] = useState<Msg[]>(scenario?.opener ? [{ role: "assistant", text: scenario.opener }] : []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [hints, setHints] = useState(false);
  const [goal, setGoal] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, busy, fb]);

  const turns = msgs.filter((m) => m.role === "user").length;
  // the server adds the scripted opener itself
  const payload = (list: Msg[]) => (scenario?.opener ? list.slice(1) : list);

  const call = async (body: object) => {
    const r = await fetch("/api/practice/roleplay", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, resourceId, scenarioId: scenario?.id, custom, lang, ...body }) });
    return r.json().catch(() => ({ ok: false }));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, text }];
    setMsgs(next); setDraft(""); setErr(""); setBusy(true);
    const j = await call({ messages: payload(next) });
    setBusy(false);
    if (j.reason === "demo") {
      const d = demoReply(scenario?.id ?? "late", next.filter((m) => m.role === "user").length, lang);
      setMsgs([...next, { role: "assistant", text: d.reply }]);
      if (d.done) setDone(true);
      return;
    }
    if (!j.ok) return setErr(say(j.reason));
    if (j.reply) setMsgs([...next, { role: "assistant", text: j.reply }]);
    if (j.done) setDone(true);
  };

  const feedback = async () => {
    setBusy(true); setErr("");
    const j = await call({ messages: payload(msgs), feedback: true });
    setBusy(false);
    if (j.reason === "demo") return setFb(demoFeedback(ideas));
    if (!j.ok) return setErr(say(j.reason));
    setFb(j.feedback);
  };

  const restart = () => {
    setMsgs(scenario?.opener ? [{ role: "assistant", text: scenario.opener }] : []);
    setFb(null); setDone(false); setErr(""); setDraft("");
  };

  const lines = [...(pushback ?? []).map((p) => ({ k: p.line, v: p.reply })), ...ideas.filter((k) => k.tryThis).map((k) => ({ k: `${k.label} · ${k.title}`, v: k.tryThis! }))];

  return (
    <div className="pr-rp">
      <div className="card pr-scene">
        <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
          <span className="pr-av" aria-hidden="true">{initials(name)}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="small" style={{ display: "block" }}>{scenario?.title ?? (lang === "es" ? "Tu conversación" : "Your conversation")}</b>
            <span className="tiny muted">{lang === "es" ? `Claude hace el papel de ${name}. Tú eres el gerente.` : `Claude plays ${name}. You're the manager.`}</span>
          </div>
          <button className="linklike tiny" onClick={onExit}>{lang === "es" ? "Salir" : "Exit"}</button>
        </div>
        <p className="small" style={{ margin: "8px 0 0" }}>{scenario?.setup ?? custom?.situation}</p>
        {scenario?.goal && (
          <button className="pr-goal" onClick={() => setGoal(!goal)} aria-expanded={goal}>
            <span className="tiny"><b>{t.goal}</b>{goal ? `: ${scenario.goal}` : " ›"}</span>
          </button>
        )}
      </div>

      <div className="pr-chat" aria-live="polite">
        {msgs.length === 0 && <p className="tiny muted" style={{ textAlign: "center" }}>{lang === "es" ? `Empieza tú. Habla como le hablarías a ${name}.` : `You start. Talk the way you'd talk to ${name}.`}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`bub ${m.role === "user" ? "me" : ""}`}>
            <span className="tiny muted">{m.role === "user" ? t.you : name}</span>
            <div>{m.text}</div>
          </div>
        ))}
        {busy && !fb && <div className="bub typing"><span /><span /><span /></div>}
        <div ref={end} />
      </div>

      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}

      {fb ? (
        <FeedbackCard fb={fb} lang={lang} name={name} persona={scenario?.persona} onAgain={restart} onExit={onExit} />
      ) : (
        <>
          {done && <div className="pr-wrapped small">{lang === "es" ? `${name} terminó la conversación. Mira cómo te fue.` : `${name} wrapped it up. See how you did.`}</div>}
          {!done && (
            <div className="pr-compose">
              <textarea
                className="f"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={lang === "es" ? "Lo que le dirías..." : "What you'd say..."}
                maxLength={800}
                rows={2}
              />
              <button className="btn primary" disabled={!draft.trim() || busy} onClick={send}>{t.send}</button>
            </div>
          )}
          <div className="pr-rp-foot">
            {lines.length > 0 && !done && <button className="btn ghost sm" onClick={() => setHints(!hints)}>💡 {t.hints}</button>}
            <span className="grow" />
            {turns > 0 && <button className="btn ghost sm" onClick={restart}>{t.restart}</button>}
            <button className="btn sm primary" disabled={turns < 2 || busy} onClick={feedback}>{t.feedback}</button>
          </div>
          {hints && !done && (
            <div className="card pr-hints">
              {lines.map((l) => (
                <button key={l.k} className="pr-hint" onClick={() => { setDraft(l.v); setHints(false); }}>
                  <span className="tiny muted">{l.k}</span>
                  <span className="small">“{l.v}”</span>
                </button>
              ))}
            </div>
          )}
          {turns < 2 && msgs.length > 0 && <p className="tiny muted" style={{ marginTop: 6 }}>{lang === "es" ? "Después de un par de intercambios puedes pedir comentarios." : "After a couple of back-and-forths you can ask for feedback."}</p>}
        </>
      )}
    </div>
  );
}

const MARK = { yes: "✓", partly: "~", no: "✕" };

export function FeedbackCard({ fb, lang, name, persona, onAgain, onExit }: { fb: Feedback; lang: Lang; name: string; persona?: string; onAgain: () => void; onExit: () => void }) {
  const [why, setWhy] = useState(false);
  return (
    <div className="card pr-fb">
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{lang === "es" ? "Cómo te fue" : "How you did"}</span>
      <p style={{ margin: "4px 0 10px" }}>{fb.overall}</p>
      <div className="pr-fb-steps">
        {fb.steps.map((s) => (
          <div key={s.label + s.title} className={`pr-fb-row m-${s.mark}`}>
            <span className="pr-mark" aria-label={s.mark}>{MARK[s.mark] ?? "~"}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="small">{s.label} {s.title}</b>
              <span className="tiny" style={{ display: "block" }}>{s.note}</span>
            </span>
          </div>
        ))}
      </div>
      {fb.strengths?.length > 0 && (
        <div className="pr-fb-block"><b className="tiny">{lang === "es" ? "Lo que funcionó" : "What worked"}</b><ul className="small">{fb.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
      )}
      {fb.tryNext && <div className="pr-fb-block"><b className="tiny">{lang === "es" ? "Para la próxima" : "Try next time"}</b><p className="small" style={{ margin: "2px 0 0" }}>{fb.tryNext}</p></div>}
      {fb.betterLine?.said && fb.betterLine.try && (
        <div className="pr-swap" style={{ marginTop: 10 }}>
          <div><span className="tiny muted">{lang === "es" ? "Dijiste" : "You said"}</span><span className="pr-not">“{fb.betterLine.said}”</span></div>
          <div><span className="tiny muted">{lang === "es" ? "Prueba" : "Try"}</span><span className="pr-yes">“{fb.betterLine.try}”</span></div>
        </div>
      )}
      {persona && (
        <div className="pr-fb-block">
          <button className="linklike tiny" onClick={() => setWhy(!why)}>{why ? "▾" : "▸"} {lang === "es" ? `Lo que le pasaba a ${name}` : `What was going on for ${name}`}</button>
          {why && <p className="tiny muted" style={{ margin: "4px 0 0" }}>{persona}</p>}
        </div>
      )}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onExit}>{lang === "es" ? "Otro escenario" : "Pick another"}</button>
        <button className="btn primary sm" onClick={onAgain}>{lang === "es" ? "Intentar otra vez" : "Try it again"}</button>
      </div>
    </div>
  );
}

/** Plan a real conversation using the training's questions. Stays on this screen only. */
export function Planner({ c, lang, onPractice }: { c: PracticeContent; lang: Lang; onPractice: (cu: Custom) => void }) {
  const t = ui(lang);
  const [who, setWho] = useState("");
  const [role, setRole] = useState("");
  const [a, setA] = useState<string[]>(() => c.planner.map(() => ""));
  const [copied, setCopied] = useState(false);
  const plan = c.planner.map((q, i) => (a[i]?.trim() ? `${q}\n${a[i].trim()}` : "")).filter(Boolean).join("\n\n");
  return (
    <div className="card pr-plan">
      <p className="tiny muted" style={{ margin: "0 0 8px" }}>🔒 {t.plannerNote}</p>
      <div className="pr-plan-who">
        <label className="f">{lang === "es" ? "¿Con quién? (nombre o apodo)" : "Who with? (first name or a nickname)"}<input className="f" value={who} onChange={(e) => setWho(e.target.value)} maxLength={40} /></label>
        <label className="f">{lang === "es" ? "Su puesto" : "Their role"}<input className="f" value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} /></label>
      </div>
      {c.planner.map((q, i) => (
        <label className="f" key={q}>
          <span><span className="pr-num">{i + 1}</span> {q}</span>
          <textarea className="f" rows={2} value={a[i] ?? ""} onChange={(e) => setA(a.map((x, k) => (k === i ? e.target.value : x)))} />
        </label>
      ))}
      <div className="sheet-actions">
        <button className="btn ghost sm" disabled={!plan} onClick={async () => { try { await navigator.clipboard.writeText(plan); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }}>{copied ? "✓" : t.copy}</button>
        <button className="btn primary sm" disabled={!a[0]?.trim()} onClick={() => onPractice({ name: who.trim() || (lang === "es" ? "tu empleado" : "your employee"), role: role.trim(), situation: plan })}>{t.practiceThis}</button>
      </div>
    </div>
  );
}
