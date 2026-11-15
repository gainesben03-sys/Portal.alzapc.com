"use client";

// The guided review: one short step at a time, saves as you go, works on a phone.
// Guided questions are the default; "Talk it through" is an option on phones.
// The writing help only rewords, sorts and translates. The manager always has the final say.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { LangSwitch, ReviewDoc, StageChip, useDemo, useLang, useTalk } from "@/components/perform";
import { useStore } from "@/lib/store";
import { downloadDocx } from "@/lib/docx";
import {
  addDays, average, docOf, docText, first, trFields, trSrc, fmtDay, Goal, GOAL_STATUS, GoalStatus, KIND_LABEL, Lang, newId, PerformSettings, pipCheckins, Review, SCALE, stageOf, StepId, stepsFor, T,
} from "@/lib/perform";
import { GetData, performApi } from "@/lib/performclient";

export default function ReviewPage() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient } = useStore();
  const client = getClient(clientId);
  const demo = useDemo(clientId);
  const toast = useToast();
  const [lang, setLang] = useLang();
  const t = T[lang];
  const [g, setG] = useState<GetData | null>(null);
  const [s, setS] = useState<PerformSettings | null>(null);
  const [r, setR] = useState<Review | null>(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState<"" | "saving" | "saved">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const call = useCallback((body: Record<string, unknown>) => performApi(clientId, body, demo), [clientId, demo]);

  useEffect(() => {
    if (!ok) return;
    (async () => {
      const [a, b] = await Promise.all([call({ action: "get", id }), call({ action: "list" })]);
      if (!a.ok) return setErr(a.reason === "forbidden" ? "forbidden" : "load");
      setG(a as GetData);
      setR(a.review);
      if (b.ok) setS(b.settings);
    })();
  }, [ok, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edits pile up here and go out together, so a quick run of taps never drops one.
  const pending = useRef<Partial<Review>>({});
  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current;
    pending.current = {};
    if (!r || !Object.keys(p).length) return true;
    const res = await call({ action: "save", id: r.id, patch: p });
    setSaving(res.ok ? "saved" : "");
    if (!res.ok && res.reason !== "locked") toast.show(lang === "es" ? "No se pudo guardar. Intente otra vez." : "Couldn't save. Try again.");
    return !!res.ok;
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { void flushRef.current(); }, []);
  const patch = (p: Partial<Review>) => {
    if (!r) return;
    setR((cur) => (cur ? { ...cur, ...p } : cur));
    pending.current = { ...pending.current, ...p };
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  if (!ok || !client) return null;
  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide pf-review">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (err) return shell(<div className="card small muted">{err === "forbidden" ? (lang === "es" ? "Esta evaluación es solo para el gerente y RR. HH." : "This review is only for the manager and HR.") : "Couldn't load this review."}</div>);
  if (!r || !g || !s) return shell(<p className="small muted">Loading…</p>);

  const f = first(r.name);
  const steps = stepsFor(r);
  const cur: StepId = steps[Math.min(step, steps.length - 1)];
  const open = r.status === "open" && g.canEdit;
  const st = stageOf(r, s);
  const minsLeft = Math.max(1, Math.round(r.template.minutes * (1 - step / steps.length)));
  const label = (k: StepId) => ({ look: t.look, rate: t.rate, words: t.words, goals: t.goals, concerns: t.concerns, timeline: t.timeline, share: t.share })[k];
  const go = (n: number) => { setStep(Math.max(0, Math.min(steps.length - 1, n))); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const head = (
    <header className="pf-rhead">
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Link href={`/c/${clientId}/reviews`} className="small" style={{ color: "var(--blue)" }}>← {t.reviews}</Link>
        <span className="grow" />
        <LangSwitch lang={lang} onChange={setLang} />
      </div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="pf-rname">{r.name} · {KIND_LABEL[r.kind][lang]}</h1>
          <p className="tiny muted" style={{ margin: "2px 0 0" }}>{r.title} · {fmtDay(r.periodStart, lang)} – {fmtDay(r.periodEnd, lang)}</p>
        </div>
        {open ? <span className="tiny muted">{t.minLeft(minsLeft)} · {saving === "saving" ? t.saving : t.saved}</span> : <StageChip st={st} lang={lang} />}
      </div>
      {open && (
        <nav className="pf-steps" aria-label="Steps">
          {steps.map((k, i) => (
            <button key={k} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
              <span className="pf-step-n">{i + 1}</span><span className="pf-step-l">{label(k)}</span>
            </button>
          ))}
        </nav>
      )}
    </header>
  );

  // ---------- locked: the finished review ----------
  if (!open) {
    const d = docOf(r, g.company || client.name, r.lang);
    return shell(
      <>
        {head}
        <div className="pf-done-layout section">
          <div className="grow" style={{ minWidth: 0 }}><ReviewDoc d={d} accent={client.accent} /></div>
          <aside className="pf-side">
            <FinishedActions r={r} g={g} lang={lang} clientId={clientId} accent={client.accent} company={g.company || client.name} onChange={setR} call={call} toast={toast.show} />
          </aside>
        </div>
      </>
    );
  }

  // ---------- steps ----------
  let body: React.ReactNode = null;
  if (cur === "look") body = <LookBack r={r} g={g} s={s} lang={lang} onPatch={patch} call={call} toast={toast.show} onBuildPip={async () => { const x = await call({ action: "start", personId: r.personId, kind: "pip" }); if (x.ok) window.location.href = `/c/${clientId}/reviews/${x.review.id}`; }} />;
  if (cur === "rate") body = <Ratings r={r} lang={lang} onPatch={patch} />;
  if (cur === "words") body = <Words r={r} s={s} lang={lang} onPatch={patch} call={call} toast={toast.show} />;
  if (cur === "goals") body = <Goals r={r} lang={lang} onPatch={patch} />;
  if (cur === "concerns") body = <Concerns r={r} lang={lang} onPatch={patch} />;
  if (cur === "timeline") body = <Timeline r={r} lang={lang} admin={g.admin} onPatch={patch} />;
  if (cur === "share") body = <Share r={r} g={g} s={s} lang={lang} accent={client.accent} company={g.company || client.name} onPatch={patch} call={call} toast={toast.show} flush={flush} onDone={(x) => setR(x)} />;

  return shell(
    <>
      {head}
      <div className="pf-step section">{body}</div>
      {cur !== "share" && (
        <div className="pf-nav">
          <button className="btn" style={{ visibility: step > 0 ? "visible" : "hidden" }} onClick={() => go(step - 1)}>{t.back}</button>
          <button className="btn primary" onClick={() => go(step + 1)}>{t.next}</button>
        </div>
      )}
    </>
  );
}

type Call = (b: Record<string, unknown>) => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- 1. look back ----------
function LookBack({ r, g, s, lang, onPatch, call, toast, onBuildPip }: { r: Review; g: GetData; s: PerformSettings; lang: Lang; onPatch: (p: Partial<Review>) => void; call: Call; toast: (m: string) => void; onBuildPip: () => void }) {
  const t = T[lang];
  const f = first(r.name);
  const [self, setSelf] = useState(r.self);
  return (
    <>
      <h2 className="pf-h">{r.kind === "pip" ? (lang === "es" ? "Antes de empezar el plan" : "Before you build the plan") : t.lookH}</h2>
      <p className="muted pf-p">{t.lookP}</p>
      {r.kind !== "pip" && g.negatives >= s.pipAfter && g.admin && (
        <div className="pf-flag"><span className="grow">{t.pipSuggest(r.name, g.negatives)}</span><button className="btn sm" onClick={onBuildPip}>{t.buildPip}</button></div>
      )}
      <div className="pf-grid2">
        {r.kind !== "pip" && (
          <section className="card">
            <h3 className="pf-h3">{t.selfH(f)}</h3>
            {self?.doneAt && self.answers?.length ? (
              self.answers.map((a) => <div key={a.q} className="pf-qa"><span>{a.q}</span><p>{a.a || "—"}</p></div>)
            ) : !s.selfAssess ? <p className="small muted">{t.selfOff}</p> : (
              <>
                <p className="small muted">{self?.sentAt ? (lang === "es" ? `Enviada ${fmtDay(self.sentAt.slice(0, 10), lang)}. ${t.selfNone(f)}` : `Sent ${fmtDay(self.sentAt.slice(0, 10), lang)}. ${t.selfNone(f)}`) : t.selfNone(f)}</p>
                {g.hasEmail ? <button className="btn sm" onClick={async () => { const x = await call({ action: "sendSelf", id: r.id }); if (x.ok) { setSelf(x.review.self); toast(lang === "es" ? "Enviada" : "Sent"); } else toast(x.reason === "no_email" ? (lang === "es" ? "No tiene correo en la lista" : "No email on the roster") : "Couldn't send it"); }}>{self?.sentAt ? (lang === "es" ? "Enviar de nuevo" : "Send again") : t.sendSelf}</button> : <p className="tiny muted">{lang === "es" ? "No tiene correo en la lista del equipo." : "No email on the team roster, so the link can't go out."}</p>}
              </>
            )}
          </section>
        )}
        <section className="card">
          <h3 className="pf-h3">{t.notesH} <span className="tiny muted">· {t.notesSub}</span></h3>
          {g.notes.length ? g.notes.map((n) => <div key={n.date + n.notes.slice(0, 10)} className="pf-note"><span>{fmtDay(n.date, lang)}</span><p>{n.notes}</p></div>) : <p className="small muted">{t.notesNone}</p>}
        </section>
      </div>
      {r.kind !== "pip" && (
        <section className="card section">
          <h3 className="pf-h3">{g.prevGoals.length ? t.progress : t.lastGoals}</h3>
          {!g.prevGoals.length ? <p className="small muted">{t.lastNone(f)}</p> : g.prevGoals.map((goal) => {
            const u = r.goalUpdates[goal.id] ?? { status: goal.status === "not_started" ? "in_progress" : goal.status };
            return (
              <div key={goal.id} className="pf-goal-prog">
                <b>{goal.text}</b>
                <div className="pf-filters" role="group" aria-label={goal.text}>
                  {(["done", "in_progress", "not_started", "deferred", "na"] as GoalStatus[]).map((k) => <button key={k} className={u.status === k ? "on" : ""} aria-pressed={u.status === k} onClick={() => onPatch({ goalUpdates: { ...r.goalUpdates, [goal.id]: { ...u, status: k } } })}>{GOAL_STATUS[k][lang]}</button>)}
                </div>
              </div>
            );
          })}
        </section>
      )}
      {g.past.length > 0 && <p className="tiny muted section">{lang === "es" ? "Evaluaciones anteriores" : "Past reviews"}: {g.past.map((p) => `${fmtDay(p.due, lang)}${p.overall ? ` (${p.overall}/${p.scale})` : ""}`).join(" · ")}</p>}
    </>
  );
}

// ---------- 2. ratings ----------
function Ratings({ r, lang, onPatch }: { r: Review; lang: Lang; onPatch: (p: Partial<Review>) => void }) {
  const t = T[lang];
  const scale = SCALE[r.template.scale];
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const avg = average(r);
  const buttons = (val: number | undefined, onPick: (n: number) => void, name: string) => (
    <div className={`pf-rate s${r.template.scale}`} role="radiogroup" aria-label={name}>
      {scale.map((x, i) => (
        <button key={i} role="radio" aria-checked={val === i + 1} aria-label={`${i + 1}, ${x[lang]}`} className={val === i + 1 ? "on" : ""} onClick={() => onPick(i + 1)}>
          <b>{i + 1}</b><span>{x[lang]}</span>
        </button>
      ))}
    </div>
  );
  return (
    <>
      <h2 className="pf-h">{t.rateH(first(r.name))}</h2>
      <p className="muted pf-p">{t.rateP}</p>
      <section className="card pf-rates-card">
        {r.template.rate.map((p) => {
          const v = r.ratings[p.id];
          return (
            <div key={p.id} className="pf-rate-row">
              <div className="pf-rate-name"><b>{p.name[lang]}</b>{p.desc && <span>{p.desc[lang]}</span>}</div>
              {buttons(v, (n) => onPatch({ ratings: { ...r.ratings, [p.id]: n } }), p.name[lang])}
              <div className="pf-rate-foot">
                <span className={v ? "pf-picked" : "tiny muted"}>{v ? `${v} · ${scale[v - 1][lang]}` : t.notRated}</span>
                {!noteOpen[p.id] && !r.rateNotes[p.id] && <button className="linklike small" onClick={() => setNoteOpen({ ...noteOpen, [p.id]: true })}>{t.addNote}</button>}
              </div>
              {(noteOpen[p.id] || r.rateNotes[p.id]) && <textarea className="f" rows={2} value={r.rateNotes[p.id] ?? ""} aria-label={`${p.name[lang]} note`} placeholder={lang === "es" ? "¿Qué influyó en esta calificación? Un ejemplo ayuda." : "What made you pick this? An example helps."} onChange={(e) => onPatch({ rateNotes: { ...r.rateNotes, [p.id]: e.target.value } })} />}
            </div>
          );
        })}
        <div className="pf-rate-row pf-overall-row">
          <div className="pf-rate-name"><b>{t.overall}</b><span>{t.overallP(avg ? String(avg) : "—")}</span></div>
          {buttons(r.overall, (n) => onPatch({ overall: n }), t.overall)}
          <span className={r.overall ? "pf-picked" : "tiny muted"}>{r.overall ? `${r.overall} · ${scale[r.overall - 1][lang]}` : t.notRated}</span>
        </div>
      </section>
    </>
  );
}

// ---------- 3. in your words ----------
function Words({ r, s, lang, onPatch, call, toast }: { r: Review; s: PerformSettings; lang: Lang; onPatch: (p: Partial<Review>) => void; call: Call; toast: (m: string) => void }) {
  const t = T[lang];
  const [busy, setBusy] = useState("");
  const [sugg, setSugg] = useState<Record<string, string> | null>(null);
  const [vague, setVague] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  const [voice, setVoice] = useState<"you" | "about">("you");
  const [talking, setTalking] = useState(false);
  const f = first(r.name);
  const help = async (tn = tone, vc = voice) => {
    setBusy("polish");
    setTone(tn);
    setVoice(vc);
    const x = await call({ action: "ai", id: r.id, op: "polish", answers: r.answers, tone: tn, voice: vc, lang });
    setBusy("");
    if (!x.ok) return toast(x.reason === "empty" ? (lang === "es" ? "Escriba algunas notas primero" : "Write a few notes first") : x.reason === "limit" ? (lang === "es" ? "Llegó al límite de hoy" : "That's the limit for today") : (lang === "es" ? "No se pudo. Intente otra vez." : "Couldn't do that right now. Try again."));
    setSugg(x.written);
    setVague(x.vague ?? []);
  };
  const ask = r.template.ask;
  return (
    <>
      <h2 className="pf-h">{t.wordsH}</h2>
      <p className="muted pf-p">{t.wordsP}</p>
      {s.talk && !talking && (
        <button className="pf-talk-cta pf-phone-only" onClick={() => setTalking(true)}>
          <MicIcon /> <span><b>{lang === "es" ? "¿Prefiere hablar?" : "Rather talk?"}</b> {t.talk}</span>
        </button>
      )}
      {talking && <Talk r={r} lang={lang} call={call} toast={toast} onCancel={() => setTalking(false)} onSorted={(answers, v) => { onPatch({ answers: { ...r.answers, ...Object.fromEntries(Object.entries(answers).filter(([, x]) => x)) } }); setVague(v); setTalking(false); }} />}
      {!talking && (
        <div className="pf-words">
          {ask.map((p) => (
            <div key={p.id} className="card pf-word">
              <label htmlFor={`a-${p.id}`}><b>{p.name[lang]}</b>{p.desc && <span>{p.desc[lang]}</span>}</label>
              <textarea id={`a-${p.id}`} className="f" rows={4} value={r.answers[p.id] ?? ""} onChange={(e) => onPatch({ answers: { ...r.answers, [p.id]: e.target.value } })} placeholder={lang === "es" ? "Notas cortas están bien" : "Short notes are fine"} />
              {sugg?.[p.id] && sugg[p.id] !== r.answers[p.id] && (
                <div className="pf-sugg">
                  <span className="pf-chip gold">{t.draft}</span>
                  <p>{sugg[p.id]}</p>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="btn sm primary" onClick={() => { onPatch({ answers: { ...r.answers, [p.id]: sugg[p.id] } }); }}>{t.useThis}</button>
                    <button className="btn sm ghost" onClick={() => setSugg({ ...sugg, [p.id]: "" })}>{t.keepMine}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!talking && s.ai && (
        <div className="pf-help">
          <button className="btn" disabled={!!busy} onClick={() => help()}>{busy ? t.polishing : t.polish}</button>
          <div className="pf-filters" role="group" aria-label={lang === "es" ? "Cómo se escribe" : "How it reads"}>
            {([["you", lang === "es" ? `Para ${f}` : `Speak to ${f}`], ["about", lang === "es" ? `Sobre ${f}` : `Write about ${f}`]] as const).map(([k, lb]) => <button key={k} className={voice === k ? "on" : ""} aria-pressed={voice === k} disabled={!!busy} onClick={() => (sugg ? help(tone, k) : setVoice(k))}>{lb}</button>)}
          </div>
          {sugg && (
            <div className="pf-filters" role="group" aria-label="Tone">
              {[["shorter", t.shorter], ["warmer", t.warmer], ["specific", t.specific]].map(([k, lb]) => <button key={k} className={tone === k ? "on" : ""} disabled={!!busy} onClick={() => help(tone === k ? "" : k)}>{lb}</button>)}
            </div>
          )}
          {sugg && <span className="tiny muted">{t.draftSub}</span>}
        </div>
      )}
      {vague.length > 0 && <div className="pf-nudge section"><b>{t.example}</b> {vague.map((v) => `"${v}"`).join(", ")}</div>}
    </>
  );
}

const MicIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></svg>
);

function Talk({ r, lang, call, toast, onCancel, onSorted }: { r: Review; lang: Lang; call: Call; toast: (m: string) => void; onCancel: () => void; onSorted: (a: Record<string, string>, vague: string[]) => void }) {
  const t = T[lang];
  const talk = useTalk(lang);
  const [phase, setPhase] = useState<"ready" | "heard">("ready");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!talk.on && talk.text && phase === "ready") setPhase("heard"); }, [talk.on]); // eslint-disable-line react-hooks/exhaustive-deps
  const sort = async () => {
    setBusy(true);
    const x = await call({ action: "ai", id: r.id, op: "sort", transcript: talk.text, lang });
    setBusy(false);
    if (!x.ok) return toast(lang === "es" ? "No se pudo ordenar. Intente otra vez." : "Couldn't sort it right now. Try again.");
    onSorted(x.answers, x.vague ?? []);
  };
  return (
    <section className="card pf-talk">
      {phase === "ready" && (
        <>
          <button className={`pf-mic ${talk.on ? "on" : ""}`} aria-label={talk.on ? t.done : t.talk} onClick={() => (talk.on ? talk.stop() : talk.start())}><MicIcon size={46} /></button>
          <b className="pf-talk-title" role="status">{talk.on ? t.listening : t.talk}</b>
          <span className="small muted" style={{ textAlign: "center" }}>{talk.on ? (lang === "es" ? "Toque cuando termine." : "Tap when you're done.") : t.talkP}</span>
          {talk.text && <p className="pf-transcript">{talk.text}</p>}
          {talk.on && <button className="btn primary block" onClick={talk.stop}>{t.done}</button>}
          {(talk.err || !talk.supported) && <p className="small" style={{ color: "var(--red)" }}>{talk.err === "denied" ? (lang === "es" ? "Permita el micrófono para este sitio." : "Allow the microphone for this site.") : t.talkNo}</p>}
          <span className="tiny muted">{t.talkPrivacy}</span>
        </>
      )}
      {phase === "heard" && (
        <>
          <b className="pf-talk-title">{t.heard}</b>
          <span className="small muted">{t.heardP}</span>
          <textarea className="f" rows={7} value={talk.text} onChange={(e) => talk.setText(e.target.value)} aria-label={t.heard} />
          <button className="btn primary block" disabled={busy || !talk.text.trim()} onClick={sort}>{busy ? t.polishing : t.sortIt}</button>
          <button className="btn block" onClick={() => { setPhase("ready"); talk.start(true); }}>{t.addMore}</button>
        </>
      )}
      <button className="linklike small" onClick={() => { talk.stop(); onCancel(); }}>{t.type}</button>
    </section>
  );
}

// ---------- 4. goals ----------
function Goals({ r, lang, onPatch }: { r: Review; lang: Lang; onPatch: (p: Partial<Review>) => void }) {
  const t = T[lang];
  const setGoal = (i: number, p: Partial<Goal>) => onPatch({ goals: r.goals.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <>
      <h2 className="pf-h">{t.goalsH}</h2>
      <p className="muted pf-p">{t.goalsP}</p>
      {r.goals.map((goal, i) => (
        <section key={goal.id} className="card pf-goal">
          <label className="f">{t.goal}<input className="f" value={goal.text} onChange={(e) => setGoal(i, { text: e.target.value })} placeholder={lang === "es" ? "Ej.: Cero errores en los pedidos de diciembre" : "e.g. Zero mis-picks on December orders"} /></label>
          <div className="pf-goal-row">
            <label className="f grow">{t.measure}<input className="f" value={goal.measure ?? ""} onChange={(e) => setGoal(i, { measure: e.target.value })} /></label>
            <label className="f" style={{ width: 160 }}>{t.by}<input className="f" value={goal.by ?? ""} onChange={(e) => setGoal(i, { by: e.target.value })} placeholder={lang === "es" ? "Fecha o 'Continuo'" : "Date or 'Ongoing'"} /></label>
          </div>
          <button className="linklike small" style={{ color: "var(--red)", alignSelf: "flex-start" }} onClick={() => onPatch({ goals: r.goals.filter((_, j) => j !== i) })}>{lang === "es" ? "Quitar" : "Remove"}</button>
        </section>
      ))}
      {r.goals.length < 6 && <button className="btn" onClick={() => onPatch({ goals: [...r.goals, { id: newId(), text: "", status: "not_started" }] })}>{t.addGoal}</button>}
    </>
  );
}

// ---------- PIP: concerns ----------
function Concerns({ r, lang, onPatch }: { r: Review; lang: Lang; onPatch: (p: Partial<Review>) => void }) {
  const t = T[lang];
  const pip = r.pip!;
  const set = (i: number, k: "what" | "expected" | "support", v: string) => onPatch({ pip: { ...pip, issues: pip.issues.map((x, j) => (j === i ? { ...x, [k]: v } : x)) } });
  return (
    <>
      <h2 className="pf-h">{t.concernsH}</h2>
      <p className="muted pf-p">{t.concernsP}</p>
      {pip.issues.map((x, i) => (
        <section key={x.id} className="card pf-issue">
          <span className="pf-issue-n">{i + 1}</span>
          <label className="f">{t.issue}<textarea className="f" rows={3} value={x.what} onChange={(e) => set(i, "what", e.target.value)} placeholder={lang === "es" ? "Lo que pasó, con fechas o ejemplos" : "What's been happening, with dates or examples"} /></label>
          <label className="f">{t.expected}<textarea className="f" rows={2} value={x.expected} onChange={(e) => set(i, "expected", e.target.value)} placeholder={lang === "es" ? "Claro y medible" : "Clear and measurable, e.g. on time for every shift"} /></label>
          <label className="f">{t.support}<textarea className="f" rows={2} value={x.support} onChange={(e) => set(i, "support", e.target.value)} placeholder={lang === "es" ? "Capacitación, reuniones, herramientas" : "Training, weekly check-ins, tools"} /></label>
          {pip.issues.length > 1 && <button className="linklike small" style={{ color: "var(--red)", alignSelf: "flex-start" }} onClick={() => onPatch({ pip: { ...pip, issues: pip.issues.filter((_, j) => j !== i) } })}>{lang === "es" ? "Quitar" : "Remove"}</button>}
        </section>
      ))}
      {pip.issues.length < 6 && <button className="btn" onClick={() => onPatch({ pip: { ...pip, issues: [...pip.issues, { id: newId(), what: "", expected: "", support: "" }] } })}>{t.addIssue}</button>}
    </>
  );
}

// ---------- PIP: timeline ----------
function Timeline({ r, lang, admin, onPatch }: { r: Review; lang: Lang; admin: boolean; onPatch: (p: Partial<Review>) => void }) {
  const t = T[lang];
  const pip = r.pip!;
  const checkins = pip.checkins.length ? pip.checkins : pipCheckins(pip.start, pip.length);
  return (
    <>
      <h2 className="pf-h">{t.timelineH}</h2>
      <section className="card pf-tl">
        <div className="pf-tl-top">
          <label className="f">{t.startDate}<input className="f" type="date" value={pip.start} onChange={(e) => onPatch({ pip: { ...pip, start: e.target.value, checkins: pipCheckins(e.target.value, pip.length) } })} /></label>
          <div>
            <span className="flabel">{t.length}</span>
            <div className="pf-filters" role="group">{([30, 60, 90] as const).map((n) => <button key={n} className={pip.length === n ? "on" : ""} aria-pressed={pip.length === n} onClick={() => onPatch({ pip: { ...pip, length: n, checkins: pipCheckins(pip.start, n) } })}>{t.days(n)}</button>)}</div>
          </div>
        </div>
        <span className="flabel section">{t.checkins}</span>
        <div className="pf-tl-list">
          {checkins.map((c, i) => (
            <label key={i} className="pf-tl-item">
              <span>{i === checkins.length - 1 ? (lang === "es" ? "Último día" : "Last day") : `${lang === "es" ? "Seguimiento" : "Check-in"} ${i + 1}`}</span>
              <input className="f" type="date" value={c.date} onChange={(e) => onPatch({ pip: { ...pip, checkins: checkins.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) } })} />
            </label>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: "10px 0 0" }}>{lang === "es" ? "Cada fecha le llega al gerente como recordatorio." : "Each date shows up as a reminder for the manager."}</p>
      </section>
      <section className="card section">
        <label className="f">{t.outcome}<textarea className="f" rows={3} value={pip.outcome} onChange={(e) => onPatch({ pip: { ...pip, outcome: e.target.value } })} /></label>
        <p className="tiny muted" style={{ marginBottom: 0 }}>{lang === "es" ? "Hable de esta redacción con RR. HH. antes de compartirla." : "Go over this wording with HR before it's shared."}</p>
      </section>
      <section className="card section">
        {admin ? (
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!pip.hrReviewed} onChange={(e) => onPatch({ pip: { ...pip, hrReviewed: e.target.checked } })} /> <b>{t.hrReviewed}</b></label>
        ) : (
          <p className="small" style={{ margin: 0 }}>{pip.hrReviewed ? `✓ ${t.hrReviewed}` : t.hrNeeded}</p>
        )}
      </section>
    </>
  );
}

// ---------- 5. share ----------
function Share({ r, g, s, lang, accent, company, onPatch, call, toast, flush, onDone }: { r: Review; g: GetData; s: PerformSettings; lang: Lang; accent: string; company: string; onPatch: (p: Partial<Review>) => void; call: Call; toast: (m: string) => void; flush: () => Promise<boolean>; onDone: (r: Review) => void }) {
  const t = T[lang];
  const f = first(r.name);
  const [how, setHow] = useState<"link" | "person">(g.hasEmail ? "link" : "person");
  const [busy, setBusy] = useState("");
  const trAny = r.translated && r.translated.lang === r.lang ? r.translated : null;
  const fields = trFields(r);
  const hasText = Object.keys(fields).length > 0;
  const stale = !!trAny && !!trAny.src && trAny.src !== trSrc(r);
  const tr = trAny && !stale ? trAny : null;
  // Spanish and English readers both get a translate option; we don't guess which language the manager wrote in.
  const needsTr = s.ai && hasText && r.lang !== lang && !tr;
  const translate = async () => {
    setBusy("tr");
    const x = await call({ action: "ai", id: r.id, op: "translate", fields, to: r.lang });
    setBusy("");
    if (!x.ok) return toast(lang === "es" ? "No se pudo traducir. Intente otra vez." : "Couldn't translate right now. Try again.");
    const F = x.fields as Record<string, string>;
    onPatch({
      translated: {
        lang: r.lang,
        src: trSrc(r),
        written: { ...Object.fromEntries(r.template.ask.filter((p) => F[`a.${p.id}`]).map((p) => [p.id, F[`a.${p.id}`]])), ...Object.fromEntries(r.template.rate.filter((p) => F[`n.${p.id}`]).map((p) => [`n.${p.id}`, F[`n.${p.id}`]])) },
        goals: r.goals.map((x) => ({ id: x.id, text: F[`g.${x.id}`] ?? x.text, measure: F[`m.${x.id}`] ?? x.measure })),
        ...(r.pip ? { pip: { issues: r.pip.issues.map((x) => ({ id: x.id, what: F[`pw.${x.id}`] ?? x.what, expected: F[`pe.${x.id}`] ?? x.expected, support: F[`ps.${x.id}`] ?? x.support })), outcome: F.outcome ?? r.pip.outcome } } : {}),
      },
    });
    if (x.demo) toast(lang === "es" ? "En la demo la traducción no está conectada" : "Translation isn't connected in the demo");
  };
  const finish = async () => {
    setBusy("fin");
    await flush();
    const x = await call({ action: "finalize", id: r.id, how });
    setBusy("");
    if (!x.ok) return toast(x.reason === "hr_review" ? t.hrNeeded : x.reason === "tr_stale" ? (lang === "es" ? "Traduzca de nuevo antes de finalizar." : "Translate again before finalizing.") : x.reason === "no_email" ? (lang === "es" ? "No tiene correo. Elija en persona." : "No email on the roster. Choose in person.") : (lang === "es" ? "No se pudo. Intente otra vez." : "Couldn't finish it. Try again."));
    onDone(x.review);
    toast(t.doneH);
  };
  const missing = r.template.rate.length > 0 && !r.overall;
  const d = docOf(r, company, r.lang);
  return (
    <>
      <h2 className="pf-h">{t.shareH}</h2>
      <div className="pf-done-layout">
        <div className="grow" style={{ minWidth: 0 }}>
          <ReviewDoc d={d} accent={accent} />
        </div>
        <aside className="pf-side">
          <section className="card">
            <span className="flabel">{t.readsIn(f)}</span>
            <div className="pf-filters" role="group">
              <button className={r.lang === "en" ? "on" : ""} aria-pressed={r.lang === "en"} onClick={() => onPatch({ lang: "en" })}>English</button>
              <button className={r.lang === "es" ? "on" : ""} aria-pressed={r.lang === "es"} onClick={() => onPatch({ lang: "es" })}>Español</button>
            </div>
            {s.ai && hasText && (
              <div style={{ marginTop: 10 }}>
                <button className={`btn sm ${needsTr || stale ? "primary" : ""}`} disabled={!!busy} onClick={translate}>{busy === "tr" ? t.translating : tr || stale ? (lang === "es" ? "Traducir de nuevo" : "Translate again") : r.lang === "es" ? (lang === "es" ? "Traducir al español" : "Translate to Spanish") : lang === "es" ? "Traducir al inglés" : "Translate to English"}</button>
                {stale && <p className="small" style={{ margin: "6px 0 0", color: "var(--red)" }}>{lang === "es" ? "Cambió la evaluación después de traducirla. Tradúzcala de nuevo." : "You changed the review after translating it. Translate it again."}</p>}
                {tr && <p className="tiny muted" style={{ margin: "6px 0 0" }}>{t.checkTr}</p>}
                {tr && <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => onPatch({ translated: null as unknown as undefined })}>{lang === "es" ? "Quitar la traducción" : "Remove translation"}</button>}
              </div>
            )}
            {tr && (
              <div className="pf-tr">
                {r.template.ask.filter((p) => tr.written[p.id] !== undefined).map((p) => (
                  <label key={p.id} className="f">{p.name[r.lang]}<textarea className="f" rows={3} value={tr.written[p.id]} onChange={(e) => onPatch({ translated: { ...tr, written: { ...tr.written, [p.id]: e.target.value } } })} /></label>
                ))}
              </div>
            )}
          </section>
          <section className="card">
            <span className="flabel">{t.how(f)}</span>
            <button className={`pf-opt ${how === "link" ? "on" : ""}`} aria-pressed={how === "link"} disabled={!g.hasEmail} onClick={() => setHow("link")}><b>{t.viaLink(f)}</b><span>{g.hasEmail ? t.viaLinkSub : lang === "es" ? "No tiene correo en la lista." : "No email on the roster."}</span></button>
            <button className={`pf-opt ${how === "person" ? "on" : ""}`} aria-pressed={how === "person"} onClick={() => setHow("person")}><b>{t.inPerson}</b><span>{t.inPersonSub}</span></button>
          </section>
          {missing && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{lang === "es" ? "Falta la calificación general." : "Add the overall rating first."}</p>}
          {needsTr && <p className="tiny muted" style={{ margin: 0 }}>{lang === "es" ? `Escribió en español y ${f} la lee en inglés. Traduzca primero para revisarla.` : `${f} reads it in ${r.lang === "es" ? "Spanish" : "English"}. Translate it first so you can check it.`}</p>}
          {r.kind === "pip" && !r.pip?.hrReviewed && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{t.hrNeeded}</p>}
          <button className="btn primary block" disabled={!!busy || missing || stale || (r.kind === "pip" && !r.pip?.hrReviewed)} onClick={finish}>{busy === "fin" ? "…" : t.finalize}</button>
          <p className="tiny muted" style={{ margin: 0 }}>{t.finalNote}</p>
        </aside>
      </div>
    </>
  );
}

// ---------- after it's finalized ----------
function FinishedActions({ r, g, lang, clientId, company, onChange, call, toast }: { r: Review; g: GetData; lang: Lang; clientId: string; accent: string; company: string; onChange: (r: Review) => void; call: Call; toast: (m: string) => void }) {
  const t = T[lang];
  const [amending, setAmending] = useState(false);
  const [note, setNote] = useState("");
  const d = docOf(r, company, r.lang);
  const es = lang === "es";
  return (
    <>
      <section className="card">
        <b className="small">{es ? "Estado" : "Status"}</b>
        <ul className="pf-timeline">
          {r.finalAt && <li>{es ? "Finalizada" : "Finalized"} {fmtDay(r.finalAt.slice(0, 10), lang)}{r.finalBy ? ` · ${r.finalBy}` : ""}</li>}
          {r.share?.how === "link" && <li>{es ? "Enlace enviado" : "Link sent"} {fmtDay(r.share.at.slice(0, 10), lang)}</li>}
          {r.share?.viewedAt && <li>{es ? "Vista" : "Viewed"} {fmtDay(r.share.viewedAt.slice(0, 10), lang)}</li>}
          {r.share?.ackAt && <li>{es ? "Confirmada" : "Signed off"} {fmtDay(r.share.ackAt.slice(0, 10), lang)}</li>}
          {r.share?.deliveredAt && <li>{es ? "Entregada en persona" : "Delivered in person"} {fmtDay(r.share.deliveredAt.slice(0, 10), lang)}</li>}
          {r.versions?.map((v) => <li key={v.at}>{es ? "Nueva versión" : "New version"} {fmtDay(v.at.slice(0, 10), lang)}: {v.note}</li>)}
        </ul>
      </section>
      <div className="row" style={{ gap: 8 }}>
        <a className="btn grow" href={`/c/${clientId}/reviews/${r.id}/print`} target="_blank" rel="noopener">{t.pdf}</a>
        <button className="btn grow" onClick={() => downloadDocx(`${d.title} - ${r.name}`, docText(d), clientId)}>{t.word}</button>
      </div>
      {g.canEdit && r.status === "shared" && r.share?.how === "person" && !r.share.deliveredAt && (
        <button className="btn primary block" onClick={async () => { const x = await call({ action: "delivered", id: r.id }); if (x.ok) { onChange(x.review); toast(es ? "Marcada como entregada" : "Marked delivered"); } }}>{t.markDelivered}</button>
      )}
      {g.canEdit && r.status !== "cancelled" && (
        amending ? (
          <section className="card">
            <label className="f">{es ? "¿Qué va a cambiar?" : "What needs to change?"}<input className="f" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn sm primary" disabled={!note.trim()} onClick={async () => { const x = await call({ action: "amend", id: r.id, note }); if (x.ok) { onChange(x.review); window.location.reload(); } }}>{es ? "Abrir nueva versión" : "Open a new version"}</button>
              <button className="btn sm ghost" onClick={() => setAmending(false)}>{es ? "Cancelar" : "Cancel"}</button>
            </div>
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>{es ? "La versión anterior queda en el historial." : "The earlier version stays in the history."}</p>
          </section>
        ) : <button className="linklike small" onClick={() => setAmending(true)}>{es ? "Hacer un cambio" : "Make a change"}</button>
      )}
    </>
  );
}
