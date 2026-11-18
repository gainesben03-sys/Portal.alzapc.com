"use client";

// An employee's survey, from an email, text or QR code. No login, no app. One question at a time,
// English or Spanish, progress saves on this device. Anonymous surveys never carry a name.
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AGREE, AGREE_ES, YESNO_ES, type PQ, type PResponse } from "@/lib/pulse";
import { demoSurveyByToken } from "@/lib/pulseclient";
import { LIVE } from "@/lib/supabase";

type Lang = "en" | "es";
type Info = { company: string; accent: string; logo: string | null; title: string; intro: string; privacy: "anonymous" | "confidential"; open: boolean; done: boolean; personal: boolean; closesAt: string; questions: PQ[] };
type Answer = PResponse["answers"][string];

const T = {
  en: {
    start: "Start", minutes: (n: number) => `About ${n} minute${n === 1 ? "" : "s"}`, of: (i: number, n: number) => `Question ${i} of ${n}`, left: (n: number) => n <= 1 ? "Under a minute left" : `About ${n} min left`,
    back: "Back", skip: "Skip", next: "Next", submit: "Send my answers", sending: "Sending…", req: "This one's required.",
    anon: "Anonymous. Your name is never attached to your answers, and results only show for groups of 5 or more. Your progress saves on this device.",
    conf: "Confidential. HR sees individual answers. Leaders only see combined results. Your progress saves on this device.",
    pickUp: (n: number) => `Pick up to ${n}`, type: "Type your answer (optional)", thanks: "Thank you", thanksP: "Your answers are in. Leadership reads every one.",
    closed: "This survey is closed", closedP: "Thanks for checking. Watch for the next one.", already: "You've already answered", alreadyP: "Thanks for sharing. Each person can answer once.",
    missing: "This link isn't available", missingP: "It may have changed. Check with HR.", preview: "Preview. Answers aren't saved.", unlikely: "Not at all likely", likely: "Extremely likely",
    error: "That didn't go through. Check your connection and try again.", review: "Review", closes: (d: string) => `Closes ${d}`,
  },
  es: {
    start: "Comenzar", minutes: (n: number) => `Unos ${n} minuto${n === 1 ? "" : "s"}`, of: (i: number, n: number) => `Pregunta ${i} de ${n}`, left: (n: number) => n <= 1 ? "Menos de un minuto" : `Faltan unos ${n} min`,
    back: "Atrás", skip: "Saltar", next: "Siguiente", submit: "Enviar mis respuestas", sending: "Enviando…", req: "Esta es obligatoria.",
    anon: "Anónima. Tu nombre nunca se vincula a tus respuestas y los resultados solo se muestran en grupos de 5 o más. Tu avance se guarda en este dispositivo.",
    conf: "Confidencial. Recursos Humanos ve las respuestas individuales. Los líderes solo ven resultados combinados. Tu avance se guarda en este dispositivo.",
    pickUp: (n: number) => `Elige hasta ${n}`, type: "Escribe tu respuesta (opcional)", thanks: "Gracias", thanksP: "Recibimos tus respuestas. La dirección lee cada una.",
    closed: "Esta encuesta está cerrada", closedP: "Gracias por revisar. Espera la próxima.", already: "Ya respondiste", alreadyP: "Gracias por participar. Cada persona puede responder una vez.",
    missing: "Este enlace no está disponible", missingP: "Puede haber cambiado. Consulta con Recursos Humanos.", preview: "Vista previa. No se guardan respuestas.", unlikely: "Nada probable", likely: "Muy probable",
    error: "No se envió. Revisa tu conexión e inténtalo de nuevo.", review: "Revisar", closes: (d: string) => `Cierra el ${d}`,
  },
};

export default function SurveyPage() {
  const { token } = useParams<{ token: string }>();
  const KEY = `alza-pulse-${token}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [step, setStep] = useState(-1); // -1 = intro
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(false);
  const [demoSubmit, setDemoSubmit] = useState<null | ((a: PResponse["answers"], l: Lang) => void)>(null);

  useEffect(() => {
    const pv = new URLSearchParams(window.location.search).get("preview") === "1";
    setPreview(pv);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved?.answers) setAnswers(saved.answers);
      if (saved?.lang) setLang(saved.lang);
      if (saved?.done && !pv) setDone(true);
    } catch {}
    if (!LIVE) {
      const d = demoSurveyByToken(token);
      if (!d) return setMissing(true);
      setInfo({ company: "Harborlight Events", accent: "#0f6e63", logo: null, title: d.s.title, intro: d.s.intro, privacy: d.s.privacy, open: pv || d.s.status === "open", done: false, personal: false, closesAt: d.s.closesAt, questions: d.s.questions });
      setDemoSubmit(() => d.submit);
      return;
    }
    fetch(`/api/pulse/s/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setInfo(j) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!info || preview || done) return;
    try { localStorage.setItem(KEY, JSON.stringify({ answers, lang })); } catch {}
  }, [answers, lang, info, preview, done, KEY]);

  const t = T[lang];
  const qs = info?.questions ?? [];
  const hasEs = qs.length > 0 && qs.every((q) => q.es);
  const q = step >= 0 ? qs[step] : undefined;
  const textOf = (x: PQ) => (lang === "es" && x.es ? x.es.text : x.text);
  const optsOf = (x: PQ) => (x.kind === "yesno" ? ["Yes", "No"] : x.options ?? []);
  const labelOf = (x: PQ, o: string, i: number) => (lang === "es" ? (x.kind === "yesno" ? YESNO_ES[i] : x.es?.options?.[i] ?? o) : o);
  const minutesLeft = useMemo(() => Math.max(1, Math.round(((qs.length - Math.max(0, step)) * 15) / 60)), [qs.length, step]);
  const set = (id: string, v: Answer) => { setErr(""); setAnswers((a) => ({ ...a, [id]: v })); };
  const has = (x: PQ) => { const v = answers[x.id]; return v !== undefined && v !== "" && !(Array.isArray(v) && !v.length); };

  const submit = async () => {
    if (preview) { setDone(true); return; }
    setSending(true);
    setErr("");
    try {
      if (!LIVE) {
        await new Promise((r) => setTimeout(r, 600));
        demoSubmit?.(answers as PResponse["answers"], lang);
      } else {
        const r = await fetch(`/api/pulse/s/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers, lang }) });
        const j = await r.json();
        if (!j.ok) {
          if (j.reason === "closed") setInfo((i) => (i ? { ...i, open: false } : i));
          else if (j.reason === "required") { const k = qs.findIndex((x) => x.id === j.id); if (k >= 0) setStep(k); setErr(t.req); }
          else setErr(t.error);
          setSending(false);
          return;
        }
      }
      try { localStorage.setItem(KEY, JSON.stringify({ done: true })); } catch {}
      setDone(true);
    } catch {
      setErr(t.error);
    }
    setSending(false);
  };
  const next = () => {
    if (q?.required && !has(q)) return setErr(t.req);
    setErr("");
    if (step === qs.length - 1) submit();
    else setStep(step + 1);
  };

  if (missing) return <main className="sign-wrap"><div className="card sign-card"><h1>{t.missing}</h1><p className="small muted">{t.missingP}</p></div></main>;
  if (!info) return <main className="sign-wrap"><p className="small muted" style={{ textAlign: "center", marginTop: 80 }}>…</p></main>;
  const brand = { ["--accent" as string]: info.accent };
  const langSwitch = hasEs && (
    <div className="ps-lang" role="group" aria-label="Language">
      {(["en", "es"] as Lang[]).map((l) => <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
    </div>
  );
  const header = (
    <div className="ps-top">
      {info.logo ? <img src={info.logo} alt={info.company} className="ps-logo" /> : <span className="ps-co">{info.company}</span>}
      {langSwitch}
    </div>
  );
  const foot = <p className="ps-foot">Employee listening by <a href="https://alzapc.com/?utm_source=portal&amp;utm_medium=pulse&amp;utm_campaign=employee" target="_blank" rel="noopener">AlzaHR</a></p>;
  const shell = (body: React.ReactNode) => <main className="sign-wrap ps" style={brand}>{header}{preview && <div className="ps-preview">{t.preview}</div>}{body}{foot}</main>;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "short", day: "numeric" });

  if (done) return shell(<div className="card sign-card ps-done"><div className="ps-check" aria-hidden="true">✓</div><h1>{t.thanks}</h1><p className="small muted">{t.thanksP}</p></div>);
  if (info.done) return shell(<div className="card sign-card"><h1>{t.already}</h1><p className="small muted">{t.alreadyP}</p></div>);
  if (!info.open) return shell(<div className="card sign-card"><h1>{t.closed}</h1><p className="small muted">{t.closedP}</p></div>);

  if (step < 0 || !q)
    return shell(
      <div className="card sign-card ps-intro">
        <h1>{info.title}</h1>
        {info.intro && <p>{info.intro}</p>}
        <p className="small muted">{t.minutes(Math.max(1, Math.round(qs.length * 0.25)))} · {t.closes(fmt(info.closesAt))}</p>
        <Privacy text={info.privacy === "anonymous" ? t.anon : t.conf} />
        <button className="btn primary ps-go" onClick={() => setStep(0)}>{Object.keys(answers).length ? t.next : t.start}</button>
      </div>
    );

  const v = answers[q.id];
  const last = step === qs.length - 1;
  return shell(
    <>
      <div className="ps-prog">
        <div className="ps-prog-l"><span>{t.of(step + 1, qs.length)}</span><span>{t.left(minutesLeft)}</span></div>
        <div className="ps-bar"><span style={{ width: `${Math.round((100 * step) / qs.length)}%` }} /></div>
      </div>
      <div className="card sign-card ps-q">
        {q.cat && lang === "en" && <span className="ps-cat">{q.cat}</span>}
        <h2 id={`q-${q.id}`}>{textOf(q)}{q.required && <span className="pq-req" aria-label="required"> *</span>}</h2>
        {q.kind === "agree" && (
          <div className="ps-opts" role="radiogroup" aria-labelledby={`q-${q.id}`}>
            {[5, 4, 3, 2, 1].map((n) => (
              <button key={n} role="radio" aria-checked={v === n} className={`ps-opt ${v === n ? "on" : ""}`} onClick={() => { set(q.id, n); if (!last) setTimeout(() => setStep((s) => Math.min(s + 1, qs.length - 1)), 260); }}>{(lang === "es" ? AGREE_ES : AGREE)[n - 1]}</button>
            ))}
          </div>
        )}
        {q.kind === "scale10" && (
          <>
            <div className="ps-scale" role="radiogroup" aria-labelledby={`q-${q.id}`}>
              {Array.from({ length: 11 }, (_, n) => <button key={n} role="radio" aria-checked={v === n} className={`ps-num ${v === n ? "on" : ""}`} onClick={() => set(q.id, n)}>{n}</button>)}
            </div>
            <div className="ps-scale-l"><span>{t.unlikely}</span><span>{t.likely}</span></div>
          </>
        )}
        {(q.kind === "choice" || q.kind === "yesno") && (
          <div className="ps-opts" role="radiogroup" aria-labelledby={`q-${q.id}`}>
            {optsOf(q).map((o, i) => <button key={o} role="radio" aria-checked={v === o} className={`ps-opt ${v === o ? "on" : ""}`} onClick={() => set(q.id, o)}>{labelOf(q, o, i)}</button>)}
          </div>
        )}
        {q.kind === "multi" && (
          <>
            <p className="tiny muted" style={{ margin: "-6px 0 10px" }}>{t.pickUp(q.max ?? 3)}</p>
            <div className="ps-opts" role="group" aria-labelledby={`q-${q.id}`}>
              {optsOf(q).map((o, i) => {
                const arr = Array.isArray(v) ? v : [];
                const on = arr.includes(o);
                const full = !on && arr.length >= (q.max ?? 3);
                return <button key={o} aria-pressed={on} disabled={full} className={`ps-opt ${on ? "on" : ""}`} onClick={() => set(q.id, on ? arr.filter((x) => x !== o) : [...arr, o])}>{labelOf(q, o, i)}</button>;
              })}
            </div>
          </>
        )}
        {q.kind === "text" && <textarea className="f ps-text" rows={5} maxLength={2000} value={typeof v === "string" ? v : ""} placeholder={t.type} onChange={(e) => set(q.id, e.target.value)} aria-labelledby={`q-${q.id}`} />}
        {err && <p className="small" style={{ color: "var(--red)", margin: "10px 0 0" }}>{err}</p>}
      </div>
      <div className="ps-nav">
        <button className="ps-link" onClick={() => { setErr(""); setStep(step - 1); }}>{t.back}</button>
        {!q.required && !last && <button className="ps-link" onClick={() => { setErr(""); setStep(step + 1); }}>{t.skip}</button>}
        <button className="btn primary ps-next" disabled={sending} onClick={next}>{sending ? t.sending : last ? t.submit : t.next}</button>
      </div>
      <Privacy text={info.privacy === "anonymous" ? t.anon : t.conf} small />
    </>
  );
}

function Privacy({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className={`ps-priv ${small ? "sm" : ""}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      <span>{text}</span>
    </div>
  );
}
