"use client";

// The guided review: one short step at a time, saves as you go, works on a phone.
// Guided questions are the default; "Talk it through" is an option on phones.
// The writing help only rewords, sorts and translates. The manager always has the final say.
import Link from "next/link";
import { TrText } from "@/components/trtext";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { LangSwitch, ReviewDoc, StageChip, useDemo, useLang, useLiveTalk } from "@/components/perform";
import { useStore } from "@/lib/store";
import { downloadDocx } from "@/lib/docx";
import {
  addDays, average, docOf, isNegative, docText, first, reviewFileName, translatedFrom, trFields, trSrc, fmtDay, Goal, GOAL_STATUS, GoalStatus, KIND_LABEL, Lang, newId, PerformSettings, pipCheckins, Review, SCALE, stageOf, StepId, stepsFor, T,
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
        <div className="pf-prog">
          <div className="pf-prog-bar" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-label={lang === "es" ? "Progreso" : "Progress"}><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
          <span className="pf-prog-l">{lang === "es" ? `Paso ${step + 1} de ${steps.length}` : `Step ${step + 1} of ${steps.length}`} · <b>{label(cur)}</b></span>
        </div>
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
          <div className="grow" style={{ minWidth: 0 }}><ReviewDoc d={d} accent={client.accent} readerLang={lang} /></div>
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
  if (cur === "rate") body = <Ratings r={r} lang={lang} onPatch={patch} onDone={() => go(step + 1)} />;
  if (cur === "words") body = <Words r={r} s={s} lang={lang} onPatch={patch} call={call} toast={toast.show} />;
  if (cur === "goals") body = <Goals r={r} s={s} lang={lang} onPatch={patch} call={call} toast={toast.show} />;
  if (cur === "concerns") body = <Concerns r={r} lang={lang} onPatch={patch} />;
  if (cur === "timeline") body = <Timeline r={r} lang={lang} admin={g.admin} onPatch={patch} />;
  if (cur === "share") body = <Share r={r} g={g} s={s} lang={lang} accent={client.accent} company={g.company || client.name} onPatch={patch} call={call} toast={toast.show} flush={flush} onDone={(x) => setR(x)} />;

  return shell(
    <>
      {head}
      <div className="pf-step section">{body}</div>
      {cur !== "share" && (
        <div className="pf-nav">
          <button className="btn" style={{ visibility: step > 0 ? "visible" : "hidden" }} onClick={() => go(step - 1)}>{lang === "es" ? "Anterior" : "Previous"}</button>
          <button className="btn primary" onClick={() => go(step + 1)}>{lang === "es" ? "Siguiente paso" : "Next step"}</button>
        </div>
      )}
      {g.admin && <CloseReview lang={lang} call={call} id={r.id} name={r.name} back={`/c/${clientId}/reviews`} />}
    </>
  );
}

/** HR only: close a review that shouldn't be open (launched by mistake, or to start over). */
function CloseReview({ lang, call, id, name, back }: { lang: Lang; call: Call; id: string; name: string; back: string }) {
  const es = lang === "es";
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="pf-close">
      {!sure ? (
        <button className="linklike small" onClick={() => setSure(true)}>{es ? "Cerrar esta evaluación" : "Close this review"}</button>
      ) : (
        <div className="pf-close-box">
          <span className="small">{es ? `¿Cerrar la evaluación de ${name}? Sale de la lista y deja de enviar recordatorios. Puede lanzar una nueva cuando quiera.` : `Close ${name}'s review? It leaves the list and reminders stop. You can launch a new one anytime.`}</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setSure(false)}>{es ? "Mantener" : "Keep it"}</button>
            <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); const x = await call({ action: "cancel", id }); setBusy(false); if (x.ok) window.location.href = back; }}>{es ? "Cerrar evaluación" : "Close review"}</button>
          </span>
        </div>
      )}
    </div>
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
      <div className="pf-look">
        {r.kind !== "pip" && (
          <details className="pf-fold" open>
            <summary>
              <span className="pf-fold-t">{t.selfH(f)}</span>
              <span className="pf-fold-m">{self?.doneAt && self.answers?.length ? (lang === "es" ? `${self.answers.length} respuestas` : `${self.answers.length} answers`) : lang === "es" ? "Pendiente" : "Not in yet"}</span>
            </summary>
            {self?.doneAt && self.answers?.length ? (
              <dl className="pf-qa-list">{self.answers.map((a) => <div key={a.q} className="pf-qa"><dt>{a.q}</dt><dd>{a.a ? <TrText text={a.a} to={lang} /> : "—"}</dd></div>)}</dl>
            ) : !s.selfAssess ? <p className="small muted">{t.selfOff}</p> : (
              <div className="pf-fold-body">
                <p className="small muted" style={{ margin: 0 }}>{self?.sentAt ? (lang === "es" ? `Enviada ${fmtDay(self.sentAt.slice(0, 10), lang)}. ${t.selfNone(f)}` : `Sent ${fmtDay(self.sentAt.slice(0, 10), lang)}. ${t.selfNone(f)}`) : t.selfNone(f)}</p>
                {g.hasEmail ? <button className="btn sm" onClick={async () => { const x = await call({ action: "sendSelf", id: r.id }); if (x.ok) { setSelf(x.review.self); toast(lang === "es" ? "Enviada" : "Sent"); } else toast(x.reason === "no_email" ? (lang === "es" ? "No tiene correo en la lista" : "No email on the roster") : "Couldn't send it"); }}>{self?.sentAt ? (lang === "es" ? "Enviar de nuevo" : "Send again") : t.sendSelf}</button> : <p className="tiny muted">{lang === "es" ? "No tiene correo en la lista del equipo." : "No email on the team roster, so the link can't go out."}</p>}
              </div>
            )}
          </details>
        )}
        <details className="pf-fold" open={g.notes.length > 0}>
          <summary>
            <span className="pf-fold-t">{t.notesH}</span>
            <span className="pf-fold-m">{g.notes.length ? (lang === "es" ? `${g.notes.length} notas · solo usted y RR. HH.` : `${g.notes.length} ${g.notes.length === 1 ? "note" : "notes"} · only you and HR`) : lang === "es" ? "Ninguna" : "None yet"}</span>
          </summary>
          {g.notes.length ? <dl className="pf-qa-list">{g.notes.map((n) => <div key={n.date + n.notes.slice(0, 10)} className="pf-qa"><dt>{fmtDay(n.date, lang)}</dt><dd><TrText text={n.notes} to={lang} /></dd></div>)}</dl> : <p className="small muted">{t.notesNone}</p>}
        </details>
        {r.kind !== "pip" && (g.prevGoals.length ? (
          <details className="pf-fold" open>
            <summary>
              <span className="pf-fold-t">{t.progress}</span>
              <span className="pf-fold-m">{g.prevGoals.length} {lang === "es" ? "metas" : g.prevGoals.length === 1 ? "goal" : "goals"}</span>
            </summary>
            {g.prevGoals.map((goal) => {
              const u = r.goalUpdates[goal.id] ?? { status: goal.status === "not_started" ? "in_progress" : goal.status };
              return (
                <div key={goal.id} className="pf-goal-prog">
                  <TrText as="div" className="pf-goal-t" text={goal.text} to={lang} />
                  <div className="pf-filters" role="group" aria-label={goal.text}>
                    {(["done", "in_progress", "not_started", "deferred", "na"] as GoalStatus[]).map((k) => <button key={k} className={u.status === k ? "on" : ""} aria-pressed={u.status === k} onClick={() => onPatch({ goalUpdates: { ...r.goalUpdates, [goal.id]: { ...u, status: k } } })}>{GOAL_STATUS[k][lang]}</button>)}
                  </div>
                </div>
              );
            })}
          </details>
        ) : (
          <div className="pf-fold-line"><span className="pf-fold-t">{t.lastGoals}</span><span className="pf-fold-m">{t.lastNone(f)}</span></div>
        ))}
      </div>
      {g.past.length > 0 && <p className="tiny muted section">{lang === "es" ? "Evaluaciones anteriores" : "Past reviews"}: {g.past.map((p) => `${fmtDay(p.due, lang)}${p.overall ? ` (${p.overall}/${p.scale})` : ""}`).join(" · ")}</p>}
    </>
  );
}

// ---------- 2. ratings ----------
/** Ratings: one card at a time by default (rate, it moves on), or everything on one page. */
function Ratings({ r, lang, onPatch, onDone }: { r: Review; lang: Lang; onPatch: (p: Partial<Review>) => void; onDone: () => void }) {
  const t = T[lang];
  const es = lang === "es";
  const [mode, setModeRaw] = useState<"cards" | "list">(() => {
    try { return localStorage.getItem("alza-pf-ratemode") === "list" ? "list" : "cards"; } catch { return "cards"; }
  });
  const setMode = (m: "cards" | "list") => { setModeRaw(m); try { localStorage.setItem("alza-pf-ratemode", m); } catch {} };
  return (
    <>
      <div className="pf-rate-head">
        <div>
          <h2 className="pf-h">{t.rateH(first(r.name))}</h2>
          <p className="muted pf-p">{mode === "cards" ? (es ? "Una a la vez. Toque una calificación y pasa a la siguiente." : "One at a time. Tap a rating and it moves to the next.") : t.rateP}</p>
        </div>
        <div className="pf-filters" role="group" aria-label={es ? "Vista" : "View"}>
          <button className={mode === "cards" ? "on" : ""} aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>{es ? "Tarjetas" : "Cards"}</button>
          <button className={mode === "list" ? "on" : ""} aria-pressed={mode === "list"} onClick={() => setMode("list")}>{es ? "Todas" : "All at once"}</button>
        </div>
      </div>
      {mode === "cards" ? <RatingCards r={r} lang={lang} onPatch={onPatch} onDone={onDone} /> : <RatingsList r={r} lang={lang} onPatch={onPatch} />}
    </>
  );
}

function RatingCards({ r, lang, onPatch, onDone }: { r: Review; lang: Lang; onPatch: (p: Partial<Review>) => void; onDone: () => void }) {
  const t = T[lang];
  const es = lang === "es";
  const scale = SCALE[r.template.scale];
  const avg = average(r);
  type Item = { id: string; name: string; desc: string; value?: number; overall?: boolean };
  const items: Item[] = [
    ...r.template.rate.map((p) => ({ id: p.id, name: p.name[lang], desc: p.desc?.[lang] ?? "", value: r.ratings[p.id] })),
    { id: "__overall", name: t.overall, desc: t.overallP(avg ? String(avg) : "—"), value: r.overall, overall: true },
  ];
  const firstOpen = items.findIndex((x) => !x.value);
  const [i, setI] = useState(firstOpen < 0 ? items.length : firstOpen);
  const [dir, setDir] = useState<1 | -1>(1);
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const go = (n: number) => {
    if (timer.current) clearTimeout(timer.current);
    setDir(n > i ? 1 : -1);
    setI(Math.max(0, Math.min(items.length, n)));
  };
  const cur = items[i];
  const pick = (v: number) => {
    if (!cur) return;
    if (cur.overall) onPatch({ overall: v });
    else onPatch({ ratings: { ...r.ratings, [cur.id]: v } });
    // move on unless they're writing a note
    if (noteOpen[cur.id] || r.rateNotes[cur.id]) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(i + 1), 420);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      const n = Number(e.key);
      if (cur && n >= 1 && n <= scale.length) { e.preventDefault(); pick(n); }
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const rated = items.filter((x) => x.value).length;

  return (
    <div className="pf-cards">

      {cur ? (
        <section
          key={cur.id}
          className={`card pf-rcard ${dir > 0 ? "in-right" : "in-left"}`}
          onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const s0 = touch.current;
            touch.current = null;
            if (!s0) return;
            const dx = e.changedTouches[0].clientX - s0.x, dy = e.changedTouches[0].clientY - s0.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? i + 1 : i - 1);
          }}
        >
          <div className="pf-rbar" aria-hidden="true"><i style={{ width: `${(rated / items.length) * 100}%` }} /></div>
          <span className="pf-rcard-n tiny">{cur.overall ? (es ? "Para cerrar" : "To finish") : `${i + 1} / ${items.length - 1}`}</span>
          <h3>{cur.name}</h3>
          {cur.desc && <p className="muted">{cur.desc}</p>}
          <div className={`pf-rlist s${r.template.scale}`} role="radiogroup" aria-label={cur.name}>
            {scale.map((x, k) => (
              <button key={k} role="radio" aria-checked={cur.value === k + 1} className={cur.value === k + 1 ? "on" : ""} onClick={() => pick(k + 1)}>
                <b>{k + 1}</b><span>{x[lang]}</span>
                <svg className="pf-rcheck" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              </button>
            ))}
          </div>
          {!cur.overall && (noteOpen[cur.id] || r.rateNotes[cur.id] ? (
            <textarea className="f" rows={2} autoFocus={!!noteOpen[cur.id] && !r.rateNotes[cur.id]} value={r.rateNotes[cur.id] ?? ""} aria-label={`${cur.name} note`} placeholder={es ? "¿Qué influyó en esta calificación? Un ejemplo ayuda." : "What made you pick this? An example helps."} onChange={(e) => onPatch({ rateNotes: { ...r.rateNotes, [cur.id]: e.target.value } })} style={{ marginTop: 12 }} />
          ) : (
            <button className="linklike small" style={{ marginTop: 12 }} onClick={() => setNoteOpen({ ...noteOpen, [cur.id]: true })}>{t.addNote}</button>
          ))}
          <div className="pf-rcard-nav">
            <button className="btn ghost sm" disabled={i === 0} onClick={() => go(i - 1)}>← {es ? "Anterior" : "Previous"}</button>
            <span className="tiny muted">{es ? `${rated} de ${items.length} calificadas` : `${rated} of ${items.length} rated`}</span>
            <button className="btn ghost sm" onClick={() => go(i + 1)}>{cur.value ? (es ? "Siguiente" : "Next") : es ? "Omitir" : "Skip"} →</button>
          </div>
        </section>
      ) : (
        <section key="summary" className="pf-sum in-right">
          {(() => {
            const ov = items[items.length - 1];
            const tone = (v?: number) => (!v ? "none" : isNegative(v, r.template.scale) ? "low" : v === scale.length || (scale.length === 5 && v === 4) ? "high" : "mid");
            return (
              <>
                <button className="pf-sum-overall" onClick={() => go(items.length - 1)}>
                  <span className="pf-sum-k">{es ? "Calificación general" : "Overall rating"}</span>
                  <span className="pf-sum-big">
                    <b className={`pf-badge lg ${tone(ov.value)}`}>{ov.value ?? "–"}</b>
                    <span>{ov.value ? scale[ov.value - 1][lang] : es ? "Sin calificar" : "Not rated yet"}</span>
                  </span>
                  {avg ? <span className="pf-sum-avg">{es ? `Promedio de las categorías: ${avg}` : `Category average ${avg}`}</span> : null}
                </button>
                <div className="pf-sum-k" style={{ marginTop: 26 }}>{es ? "Calificaciones" : "Performance ratings"}</div>
                <div className="pf-sum-list">
                  {items.slice(0, -1).map((x, k) => (
                    <button key={x.id} className="pf-sum-row" onClick={() => go(k)}>
                      <span className="pf-sum-name">{x.name}<small>{x.value ? scale[x.value - 1][lang] : es ? "Sin calificar" : "Not rated"}</small></span>
                      <b className={`pf-badge ${tone(x.value)}`}>{x.value ?? "–"}</b>
                    </button>
                  ))}
                </div>
                <p className="tiny muted" style={{ margin: "12px 0 0" }}>{es ? "Toque cualquiera para cambiarla." : "Tap any rating to change it."}</p>
              </>
            );
          })()}
        </section>
      )}
    </div>
  );
}

function RatingsList({ r, lang, onPatch }: { r: Review; lang: Lang; onPatch: (p: Partial<Review>) => void }) {
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
      <ol className="pf-scale-key" aria-hidden="true">{scale.map((x, i) => <li key={i}><b>{i + 1}</b>{x[lang]}</li>)}</ol>
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
  // Read your notes in the other language. Editing stays in your own words.
  const [view, setView] = useState<"mine" | Lang>("mine");
  const [trView, setTrView] = useState<Record<string, Record<string, string>>>({});
  const trKey = (to: Lang) => `${to}|${JSON.stringify(r.answers)}`;
  const showIn = async (to: "mine" | Lang) => {
    setView(to);
    if (to === "mine" || trView[trKey(to)]) return;
    const fields = Object.fromEntries(Object.entries(r.answers).filter(([, v]) => v?.trim()));
    if (!Object.keys(fields).length) { setTrView({ ...trView, [trKey(to)]: {} }); return; }
    setBusy("view");
    const x = await call({ action: "ai", id: r.id, op: "translate", fields, to });
    setBusy("");
    if (!x.ok) { setView("mine"); return toast(x.reason === "limit" ? (lang === "es" ? "Llegó al límite de hoy" : "That's the limit for today") : lang === "es" ? "No se pudo traducir." : "Couldn't translate. Try again."); }
    if (x.demo) toast(lang === "es" ? "La traducción no está conectada en la demo." : "Translation isn't connected in the demo.");
    setTrView({ ...trView, [trKey(to)]: x.fields ?? {} });
  };
  const shownTr = view !== "mine" ? trView[trKey(view)] : null;
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
        <button className="pf-talk-cta" onClick={() => setTalking(true)}>
          <MicIcon /> <span><b>{lang === "es" ? "¿Prefiere hablar?" : "Rather talk?"}</b> {lang === "es" ? `Responda unas preguntas en voz alta y armamos el borrador.` : `Answer a few questions out loud and we'll build the draft.`}</span>
        </button>
      )}
      {talking && (
        <Coach r={r} lang={lang} call={call} toast={toast} onCancel={() => setTalking(false)}
          onDone={(answers, goals) => {
            const merged = { ...r.answers };
            for (const [k, v] of Object.entries(answers)) if (v.trim()) merged[k] = r.answers[k]?.trim() ? `${r.answers[k].trim()}\n\n${v.trim()}` : v.trim();
            let gs = r.goals;
            for (const g of goals.filter((x) => x.text.trim())) {
              const goal = { id: newId(), text: g.text, measure: g.measure, by: g.by, status: "not_started" as const };
              const blank = gs.findIndex((x) => !x.text.trim());
              gs = blank >= 0 ? gs.map((x, j) => (j === blank ? { ...goal, id: x.id } : x)) : [...gs, goal].slice(0, 6);
            }
            onPatch({ answers: merged, goals: gs });
            setTalking(false);
            toast(lang === "es" ? "Listo. Revise y edite lo que quiera." : "Done. Read it over and change anything you like.");
          }} />
      )}
      {!talking && s.ai && Object.values(r.answers).some((v) => v?.trim()) && (
        <div className="pf-viewas">
          <span className="tiny muted">{lang === "es" ? "Ver mis notas en" : "View my notes in"}</span>
          <div className="pf-filters" role="group" aria-label={lang === "es" ? "Ver en" : "View in"}>
            {([["mine", lang === "es" ? "Como las escribí" : "As I wrote them"], ["en", "English"], ["es", "Español"]] as const).map(([k, lb]) => <button key={k} className={view === k ? "on" : ""} aria-pressed={view === k} disabled={busy === "view"} onClick={() => showIn(k)}>{busy === "view" && view === k ? "…" : lb}</button>)}
          </div>
          {view !== "mine" && <span className="tiny muted">{lang === "es" ? "Solo para leer. Para cambiar algo, vuelva a sus notas." : "For reading. To change anything, switch back to your notes."}</span>}
        </div>
      )}
      {!talking && (
        <div className="pf-words">
          {ask.map((p) => (
            <div key={p.id} className="card pf-word">
              <label htmlFor={`a-${p.id}`}><b>{p.name[lang]}</b>{p.desc && <span>{p.desc[lang]}</span>}</label>
              {shownTr ? (
                <div className="f pf-answer pf-tr" aria-live="polite">{shownTr[p.id] || (r.answers[p.id] ? "" : <span className="muted">{lang === "es" ? "Sin notas todavía" : "No notes yet"}</span>)}</div>
              ) : (
                <textarea id={`a-${p.id}`} className="f pf-answer" rows={5} value={r.answers[p.id] ?? ""} onChange={(e) => onPatch({ answers: { ...r.answers, [p.id]: e.target.value } })} placeholder={lang === "es" ? "Notas cortas están bien" : "Short notes are fine"} />
              )}
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

// ---------- the review coach: one question at a time, by voice or typing ----------
type CoachMsg = { from: "coach" | "me"; text: string; flag?: boolean; hint?: string };
const COACH = {
  en: { sub: "I'll ask a few questions. Talk or type, and I'll turn it into a draft you can edit.", tap: "Start talking", stop: "Done, send it", listening: "Listening… pause when you're done and I'll move on.", pause: "Stop mic", liveHint: "The mic stays on for the whole conversation. Say your answer, then pause.", type: "Or type here", next: "Send", skip: "Skip", read: "Read questions aloud", thinking: "Thinking…", writing: "Writing your draft…", draft: "Here's your draft", draftSub: "Written up from what you said. Nothing added. Change anything, then use it.", use: "Use this draft", back: "Back to the form", gap: "Needs your input", gaps: (n: number) => `${n} ${n === 1 ? "section needs" : "sections need"} your input.`, later: "Let's leave that one for you to fill in later.", goals: "Goals", goalsQ: (f: string) => `Last one. What goals do you have for ${f} before the next review?`, start: "Let's start.", noRate: "No ratings here. You set those yourself on the form.", fail: "Couldn't reach the coach. I kept your answer.", none: "Nothing for this one" },
  es: { sub: "Le haré unas preguntas. Hable o escriba, y lo convierto en un borrador que puede editar.", tap: "Empezar a hablar", stop: "Listo, enviar", listening: "Escuchando… haga una pausa al terminar y sigo.", pause: "Apagar mic", liveHint: "El micrófono queda encendido toda la conversación. Responda y haga una pausa.", type: "O escriba aquí", next: "Enviar", skip: "Omitir", read: "Leer las preguntas en voz alta", thinking: "Pensando…", writing: "Escribiendo su borrador…", draft: "Su borrador", draftSub: "Redactado a partir de lo que dijo. Nada agregado. Cambie lo que quiera y úselo.", use: "Usar este borrador", back: "Volver al formulario", gap: "Falta su respuesta", gaps: (n: number) => `${n} ${n === 1 ? "sección necesita" : "secciones necesitan"} su respuesta.`, later: "Dejemos esa para que la complete después.", goals: "Metas", goalsQ: (f: string) => `La última. ¿Qué metas tiene para ${f} antes de la próxima evaluación?`, start: "Empecemos.", noRate: "Aquí no hay calificaciones. Esas las pone usted en el formulario.", fail: "No se pudo conectar con el asistente. Guardé su respuesta.", none: "Nada en esta" },
};

function Coach({ r, lang, call, toast, onCancel, onDone }: { r: Review; lang: Lang; call: Call; toast: (m: string) => void; onCancel: () => void; onDone: (answers: Record<string, string>, goals: { text: string; measure: string; by: string }[]) => void }) {
  const C = COACH[lang];
  const f = first(r.name);
  const [typed, setTyped] = useState("");
  const sendRef = useRef<(t?: string) => void>(() => undefined);
  const live = useLiveTalk(lang, (t) => sendRef.current(t));
  const question = (p: Review["template"]["ask"][number]) => {
    const n = p.name[lang].replace(/\bthey\b/g, f).replace(/\bthem\b/g, f).replace(/\ble va a apoyar\?/, `va a apoyar a ${f}?`);
    return /[?¿]/.test(n) ? n : lang === "es" ? `¿Qué diría sobre ${n.toLowerCase()} de ${f}?` : `What would you say about ${f}'s ${n.charAt(0).toLowerCase() + n.slice(1)}?`;
  };
  const steps = [...r.template.ask.map((p) => ({ id: p.id, label: p.name[lang], q: question(p), hint: p.desc?.[lang] })), { id: "__goals", label: C.goals, q: C.goalsQ(f), hint: undefined as string | undefined }];
  const [i, setI] = useState(0);
  const [msgs, setMsgs] = useState<CoachMsg[]>([{ from: "coach", text: `${C.start} ${steps[0].q}`, hint: steps[0].hint }]);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  const [followed, setFollowed] = useState(false);
  const [gaps, setGaps] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "turn" | "draft">("");
  const [aloud, setAloud] = useState(false);
  const [draft, setDraft] = useState<{ answers: Record<string, string>; goals: { text: string; measure: string; by: string }[] } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, draft, busy]);

  // Speak the question (if asked to), then let the mic listen again. It ignores itself while speaking.
  const speak = (text: string) => {
    if (!aloud || typeof window === "undefined" || !window.speechSynthesis) return void setTimeout(live.resume, 250);
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "es" ? "es-US" : "en-US";
    u.onend = () => setTimeout(live.resume, 400);
    u.onerror = () => live.resume();
    window.speechSynthesis.speak(u);
  };
  const coachSays = (text: string, extra: Partial<CoachMsg> = {}) => { setMsgs((m) => [...m, { from: "coach", text, ...extra }]); speak(text); };

  const finish = async (all: Record<string, string>) => {
    live.stop();
    setBusy("draft");
    const { __goals, ...rest } = all;
    const x = await call({ action: "ai", id: r.id, op: "coachDraft", said: rest, goals: __goals ?? "", lang });
    setBusy("");
    if (!x.ok) {
      toast(C.fail);
      return setDraft({ answers: rest, goals: (__goals ?? "").trim() ? [{ text: __goals.trim(), measure: "", by: "" }] : [] });
    }
    setDraft({ answers: x.answers ?? {}, goals: x.goals ?? [] });
  };

  const advance = (all: Record<string, string>, lead = "") => {
    setFollowed(false);
    if (i + 1 < steps.length) {
      setI(i + 1);
      coachSays(`${lead ? lead + " " : ""}${steps[i + 1].q}`);
      setMsgs((m) => m.map((x, k) => (k === m.length - 1 ? { ...x, hint: steps[i + 1].hint } : x)));
    } else {
      if (lead) coachSays(lead);
      finish(all);
    }
  };

  const gapOut = (id: string, all: Record<string, string>) => { if (!all[id]?.trim()) setGaps((g) => [...new Set([...g, id])]); };

  const send = async (heardText?: string) => {
    if (busy) return;
    const text = (heardText ?? (typed.trim() || live.take())).trim();
    setTyped("");
    if (!text) return toast(lang === "es" ? "No le escuché. Intente otra vez o escríbalo." : "Didn't catch that. Try again, or type it.");
    live.hold();
    const step = steps[i];
    setMsgs((m) => [...m, { from: "me", text }]);
    const attempt = (tries[step.id] ?? 0) + 1;
    setBusy("turn");
    const x = await call({ action: "ai", id: r.id, op: "coach", current: step.id, said: text, sofar: said[step.id] ?? "", attempt, followed, lang });
    setBusy("");
    const add = (id: string) => { const prev = said[id]?.trim() ?? ""; const all = { ...said, [id]: `${prev ? (/[.!?]$/.test(prev) ? prev : prev + ".") + " " : ""}${text}` }; setSaid(all); setGaps((g) => g.filter((z) => z !== id)); return all; };
    if (!x.ok) { toast(C.fail); return advance(add(step.id)); }
    const reply = String(x.reply ?? "");
    switch (x.kind) {
      case "good": return advance(add(step.id), reply);
      case "thin": add(step.id); setFollowed(true); return coachSays(reply);
      case "elsewhere": { const id = steps.some((z) => z.id === x.fileUnder) ? String(x.fileUnder) : step.id; const all = add(id); return id === step.id ? advance(all, reply) : coachSays(reply); }
      case "sensitive": return coachSays(reply, { flag: true });
      default: { // none / unclear
        setTries((t) => ({ ...t, [step.id]: attempt }));
        if (said[step.id]?.trim()) return advance(said, lang === "es" ? "No pasa nada." : "No problem.");
        if (attempt >= 3) { gapOut(step.id, said); return advance(said, C.later); }
        return coachSays(reply);
      }
    }
  };

  sendRef.current = send;
  const skip = () => { live.take(); setTyped(""); live.hold(); gapOut(steps[i].id, said); advance(said); };

  if (draft) {
    const open = r.template.ask.filter((p) => !draft.answers[p.id]?.trim()).length + (draft.goals.length ? 0 : 1);
    return (
      <section className="card rc-draft pf-coach">
        <h2>{C.draft}</h2>
        <p className="small muted">{C.draftSub}</p>
        {r.template.ask.map((p) => (
          <label key={p.id} className="rc-sec">
            <h3>{p.name[lang]}</h3>
            <textarea className={`f ${draft.answers[p.id]?.trim() ? "" : "rc-gap"}`} rows={Math.min(14, Math.max(3, Math.ceil((draft.answers[p.id]?.length ?? 0) / 34) + 1))} value={draft.answers[p.id] ?? ""} placeholder={gaps.includes(p.id) ? C.gap : C.none} onChange={(e) => setDraft({ ...draft, answers: { ...draft.answers, [p.id]: e.target.value } })} />
          </label>
        ))}
        <div className="rc-sec">
          <h3>{C.goals}</h3>
          {draft.goals.length === 0 && <p className={gaps.includes("__goals") ? "rc-gap" : "muted small"}>{gaps.includes("__goals") ? C.gap : C.none}</p>}
          {draft.goals.map((g, k) => (
            <textarea key={k} className="f" rows={2} style={{ marginBottom: 6 }} value={g.text} aria-label={`${C.goals} ${k + 1}`} onChange={(e) => setDraft({ ...draft, goals: draft.goals.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
          ))}
        </div>
        {open > 0 && <p className="rc-gapnote">{C.gaps(open)}</p>}
        <p className="tiny muted">{C.noRate}</p>
        <div className="rc-row">
          <button className="btn primary" onClick={() => onDone(draft.answers, draft.goals)}>{C.use}</button>
          <button className="btn" onClick={onCancel}>{C.back}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card pf-coach">
      <p className="small muted" style={{ marginTop: 0 }}>{C.sub}</p>
      <div className="rc-progress" aria-hidden="true">{steps.map((z, k) => <i key={z.id} className={k < i ? "done" : k === i ? "on" : ""} />)}</div>
      <div className="rc-chat" aria-live="polite">
        {msgs.map((m, k) => (
          <div key={k} className={`rc-msg ${m.from}${m.flag ? " flag" : ""}`}>
            {m.text}
            {m.hint && <span className="tiny muted" style={{ display: "block", marginTop: 4 }}>{m.hint}</span>}
          </div>
        ))}
        {busy && <div className="rc-msg coach muted">{busy === "draft" ? C.writing : C.thinking}</div>}
        <div ref={end} />
      </div>
      {busy !== "draft" && (
        <div className="rc-bar">
          {live.supported && !live.on && (
            <button className="rc-mic" onClick={() => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); live.start(); }} disabled={!!busy}>
              <MicIcon size={24} /><span>{C.tap}</span>
            </button>
          )}
          {live.on && (
            <div className="rc-live" role="status">
              <span className={`rc-dot ${busy ? "" : "on"}`} aria-hidden="true" />
              <span className="grow">{busy ? C.thinking : live.text ? <i>{live.text}</i> : C.listening}</span>
              <button className="btn sm" onClick={live.stop}>{C.pause}</button>
            </div>
          )}
          {live.on && !busy && <span className="tiny muted">{C.liveHint}</span>}
          {live.err === "denied" && <p className="small" style={{ color: "var(--red)" }}>{lang === "es" ? "Permita el micrófono para este sitio." : "Allow the microphone for this site."}</p>}
          <textarea className="rc-input" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={C.type} aria-label={C.type} />
          <div className="rc-row">
            <label className="rc-aloud"><input type="checkbox" checked={aloud} onChange={(e) => setAloud(e.target.checked)} /> {C.read}</label>
            <span className="grow" />
            <button className="btn" disabled={!!busy} onClick={skip}>{C.skip}</button>
            <button className="btn primary" disabled={!!busy || (!typed.trim() && !live.text.trim())} onClick={() => send()}>{C.next}</button>
          </div>
          <button className="linklike small" style={{ alignSelf: "flex-start" }} onClick={() => { live.stop(); onCancel(); }}>{C.back}</button>
        </div>
      )}
    </section>
  );
}

// ---------- 4. goals ----------
function Goals({ r, s, lang, onPatch, call, toast }: { r: Review; s: PerformSettings; lang: Lang; onPatch: (p: Partial<Review>) => void; call: Call; toast: (m: string) => void }) {
  const t = T[lang];
  const es = lang === "es";
  const setGoal = (i: number, p: Partial<Goal>) => onPatch({ goals: r.goals.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<{ text: string; measure: string; by: string }[] | null>(null);
  const hasFeedback = Object.values(r.answers).some((v) => v?.trim()) || Object.values(r.rateNotes).some((v) => v?.trim());
  const suggest = async () => {
    setBusy(true);
    const x = await call({ action: "ai", id: r.id, op: "goals", lang });
    setBusy(false);
    if (!x.ok) return toast(x.reason === "limit" ? (lang === "es" ? "Llegó al límite de hoy" : "That's the limit for today") : x.reason === "empty" ? (es ? "Escriba primero sus comentarios en el paso 3." : "Add your feedback in step 3 first.") : es ? "No se pudo sugerir. Intente otra vez." : "Couldn't suggest goals. Try again.");
    setIdeas(x.goals ?? []);
    if (!(x.goals ?? []).length) toast(es ? "No hay suficiente en sus comentarios para sugerir metas." : "There isn't enough in your feedback to suggest goals yet.");
  };
  const add = (g: { text: string; measure: string; by: string }) => {
    const blank = r.goals.findIndex((x) => !x.text.trim());
    const goal = { id: newId(), text: g.text, measure: g.measure, by: g.by, status: "not_started" as const };
    onPatch({ goals: blank >= 0 ? r.goals.map((x, j) => (j === blank ? { ...goal, id: x.id } : x)) : [...r.goals, goal].slice(0, 6) });
    setIdeas((cur) => (cur ?? []).filter((x) => x !== g));
  };
  return (
    <>
      <h2 className="pf-h">{t.goalsH}</h2>
      <p className="muted pf-p">{t.goalsP}</p>
      {s.ai && (
        <div className="pf-help" style={{ marginTop: 0, marginBottom: 14 }}>
          <button className="btn" disabled={busy || !hasFeedback} onClick={suggest}>{busy ? (es ? "Pensando…" : "Thinking…") : es ? "Sugerir metas según mis comentarios" : "Suggest goals from my feedback"}</button>
          <span className="tiny muted">{hasFeedback ? (es ? "Ideas basadas solo en lo que escribió. Usted decide." : "Ideas based only on what you wrote. You decide what goes in.") : es ? "Escriba sus comentarios en el paso 3 y vuelva aquí." : "Write your feedback in step 3, then come back."}</span>
        </div>
      )}
      {ideas && ideas.length > 0 && (
        <div className="pf-ideas">
          {ideas.map((g, i) => (
            <div key={i} className="pf-idea">
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{g.text}</b>
                {(g.measure || g.by) && <span className="tiny muted">{[g.measure, g.by].filter(Boolean).join(" · ")}</span>}
              </div>
              <button className="btn sm primary" onClick={() => add(g)}>{es ? "Agregar" : "Add"}</button>
            </div>
          ))}
          <button className="linklike tiny" onClick={() => setIdeas(null)}>{es ? "Descartar ideas" : "Dismiss ideas"}</button>
        </div>
      )}
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
  const translate = async (auto = false) => {
    setBusy("tr");
    const x = await call({ action: "ai", id: r.id, op: "translate", fields, to: r.lang });
    setBusy("");
    if (!x.ok) return auto ? undefined : toast(lang === "es" ? "No se pudo traducir. Intente otra vez." : "Couldn't translate right now. Try again.");
    if (x.demo && auto) return;
    const F = x.fields as Record<string, string>;
    onPatch({
      translated: translatedFrom(r, r.lang, F),
    });
    if (x.demo) toast(lang === "es" ? "En la demo la traducción no está conectada" : "Translation isn't connected in the demo");
  };
  // translate on its own: when the review is first shared, when its language changes, or after edits
  // (the AI leaves text alone if it's already in that language)
  const autoKey = `${r.lang}:${trSrc(r)}`;
  useEffect(() => {
    if (!s.ai || !hasText || busy || (tr && tr.lang === r.lang)) return;
    const t = setTimeout(() => { translate(true); }, stale ? 1200 : 200);
    return () => clearTimeout(t);
  }, [autoKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
          <ReviewDoc d={d} accent={accent} readerLang={lang} />
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
                <button className={`btn sm ${needsTr || stale ? "primary" : ""}`} disabled={!!busy} onClick={() => translate()}>{busy === "tr" ? t.translating : tr || stale ? (lang === "es" ? "Traducir de nuevo" : "Translate again") : r.lang === "es" ? (lang === "es" ? "Traducir al español" : "Translate to Spanish") : lang === "es" ? "Traducir al inglés" : "Translate to English"}</button>
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
          {busy === "tr" && <p className="tiny muted" style={{ margin: 0 }}>{lang === "es" ? `Traduciendo para que ${f} la lea en ${r.lang === "es" ? "español" : "inglés"}…` : `Translating so ${f} can read it in ${r.lang === "es" ? "Spanish" : "English"}…`}</p>}
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
        <button className="btn grow" onClick={() => downloadDocx(d.title, docText(d), clientId, reviewFileName(r))}>{t.word}</button>
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
