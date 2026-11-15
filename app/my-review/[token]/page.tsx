"use client";

// The employee's side, from an email link. No login. English or Spanish.
// Self-assessment: four questions, one at a time, saved as they go, and they can talk instead of type.
// Review: read it, add a comment if they want, and confirm they received it.
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReviewDoc, useTalk } from "@/components/perform";
import { ACK_TEXT, ACK_TEXT_PIP, Doc, Lang, SELF_Q } from "@/lib/perform";

type Info =
  | { mode: "self"; company: string; accent: string; logo: string | null; first: string; manager: string; lang: Lang; closed: boolean; done: boolean; answers: { q: string; a: string }[] }
  | { mode: "review"; company: string; accent: string; logo: string | null; first: string; manager: string; lang: Lang; doc: Doc; docOther: Doc | null; acked: boolean; signOff: boolean };

const SAMPLE_DOC: Doc = {
  title: "Performance Review", company: "Harborlight Events", name: "Sam Patel", jobTitle: "Inventory Coordinator", department: "Warehouse", manager: "Dana Ortiz", hireDate: "", period: "Nov 2025 – Nov 2026", date: "Nov 24, 2026", format: "Quick scorecard",
  rated: [{ name: "Quality of work", value: 4, label: "Exceeds expectations", note: "" }, { name: "Communication", value: 3, label: "Meets expectations", note: "" }, { name: "Teamwork", value: 4, label: "Exceeds expectations", note: "" }, { name: "Reliability", value: 4, label: "Exceeds expectations", note: "" }],
  overall: { value: 4, label: "Exceeds expectations" },
  written: [{ q: "What's going well?", a: "Sam cut inventory counts from three days to one and stays calm when event orders change at the last minute." }, { q: "What should they work on?", a: "Planning ahead for busy season, including learning the forecasting sheet." }, { q: "How will you help?", a: "Dana will walk Sam through the forecasting sheet in January." }],
  goals: [{ text: "Own the busy-season forecast", measure: "Forecast ready to share", by: "Mar 1" }], pip: null, comment: "", ack: "", ackHow: "link", managerDone: "Nov 24, 2026", ackText: ACK_TEXT.en, lang: "en",
};

export default function MyReview() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const demo = token === "demo" || token === "demo-review";

  useEffect(() => {
    const sample = (): Info => (token === "demo-review"
      ? { mode: "review", company: "Harborlight Events", accent: "#0f766e", logo: null, first: "Sam", manager: "Dana", lang: "en", doc: SAMPLE_DOC, docOther: null, acked: false, signOff: true }
      : { mode: "self", company: "Harborlight Events", accent: "#0f766e", logo: null, first: "Sam", manager: "Dana", lang: "en", closed: false, done: false, answers: [] });
    fetch(`/api/my-review/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const x: Info | null = j.ok ? j : j.reason === "demo" || demo ? sample() : null;
        if (!x) return setMissing(true);
        setInfo(x);
        setLang(x.lang);
      })
      .catch(() => (demo ? (setInfo(sample()), setLang("en")) : setMissing(true)));
  }, [token, demo]);

  const es = lang === "es";
  if (missing) return <div className="ex-page"><div className="ex-card"><h1>{es ? "Este enlace no está disponible" : "This link isn't available"}</h1><p className="ex-sub">{es ? "Puede que ya haya cerrado. Pregunte a su gerente." : "It may have closed. Check with your manager."}</p></div></div>;
  if (!info) return <div className="ex-page" />;

  return (
    <div className="ex-page my-rv" style={{ ["--ex" as string]: info.accent }}>
      <div className="my-rv-top">
        {info.logo ? <img src={info.logo} alt={info.company} /> : <b>{info.company}</b>}
        <div className="pf-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
          <button className={lang === "es" ? "on" : ""} aria-pressed={lang === "es"} onClick={() => setLang("es")}>Español</button>
        </div>
      </div>
      {info.mode === "self" ? <Self info={info} lang={lang} token={token} demo={demo} /> : <Read info={info} lang={lang} token={token} demo={demo} />}
    </div>
  );
}

function Self({ info, lang, token, demo }: { info: Extract<Info, { mode: "self" }>; lang: Lang; token: string; demo: boolean }) {
  const es = lang === "es";
  const [i, setI] = useState(0);
  const [a, setA] = useState<string[]>(() => SELF_Q.map((_, k) => info.answers[k]?.a ?? ""));
  const [done, setDone] = useState(info.done);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talk = useTalk(lang);
  const post = (submit: boolean, answers = a) => (demo ? Promise.resolve({ ok: true }) : fetch(`/api/my-review/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "self", answers, lang, submit }) }).then((r) => r.json()).catch(() => ({ ok: false })));
  const set = (v: string) => {
    const next = a.map((x, k) => (k === i ? v : x));
    setA(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => post(false, next), 900);
  };
  useEffect(() => { if (talk.text) set(talk.text); }, [talk.text]); // eslint-disable-line react-hooks/exhaustive-deps
  if (info.closed) return <div className="my-rv-body"><h1 className="my-rv-h">{es ? "Ya está cerrada" : "This has closed"}</h1><p className="my-rv-p">{es ? `${info.manager} ya terminó su evaluación. Recibirá un enlace para leerla.` : `${info.manager} has finished your review. You'll get a link to read it.`}</p></div>;
  if (done) return (
    <div className="my-rv-body my-rv-center">
      <span className="my-rv-check" aria-hidden="true">✓</span>
      <h1 className="my-rv-h">{es ? `Gracias, ${info.first}` : `Thanks, ${info.first}`}</h1>
      <p className="my-rv-p">{es ? `${info.manager} tiene sus respuestas. Recibirá su evaluación por correo cuando esté lista.` : `${info.manager} has your answers. You'll get your review by email once it's ready.`}</p>
      <button className="btn" onClick={() => { setDone(false); setI(0); }}>{es ? "Cambiar mis respuestas" : "Change my answers"}</button>
    </div>
  );
  return (
    <div className="my-rv-body">
      <span className="my-rv-step">{es ? `Pregunta ${i + 1} de 4 · unos 5 minutos` : `Question ${i + 1} of 4 · about 5 minutes total`}</span>
      <span className="my-rv-bar"><span style={{ width: `${((i + 1) / 4) * 100}%` }} /></span>
      {i === 0 && <p className="my-rv-p">{es ? `Hola ${info.first}. ${info.manager} hablará con usted pronto sobre su trabajo. Unas palabras aquí ayudan. Solo lo ven su gerente y RR. HH.` : `Hi ${info.first}. ${info.manager} will meet with you soon about your work. A few words here help the conversation. Only your manager and HR see this.`}</p>}
      <label className="my-rv-q" htmlFor="ans">{SELF_Q[i][lang]}</label>
      <textarea id="ans" className="my-rv-in" rows={6} value={a[i]} onChange={(e) => set(e.target.value)} placeholder={es ? "Una o dos frases está bien" : "A sentence or two is plenty"} />
      {talk.supported && (
        <button className={`my-rv-mic ${talk.on ? "on" : ""}`} onClick={() => (talk.on ? talk.stop() : talk.start(true))}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></svg>
          {talk.on ? (es ? "Escuchando… toque para parar" : "Listening… tap to stop") : es ? "Prefiero hablar" : "I'd rather say it"}
        </button>
      )}
      <span className="tiny muted">{es ? "Se guarda mientras escribe. Puede volver desde el correo." : "Saved as you type. Come back anytime from the email."}</span>
      <div className="my-rv-nav">
        {i > 0 && <button className="btn" onClick={() => { talk.stop(); setI(i - 1); }}>{es ? "Atrás" : "Back"}</button>}
        <button className="btn primary" disabled={busy} onClick={async () => {
          talk.stop();
          if (i < 3) return setI(i + 1);
          setBusy(true);
          const r = await post(true);
          setBusy(false);
          if (r.ok) setDone(true);
        }}>{i < 3 ? (es ? "Siguiente" : "Next") : es ? `Enviar a ${info.manager}` : `Send to ${info.manager}`}</button>
      </div>
    </div>
  );
}

function Read({ info, lang, token, demo }: { info: Extract<Info, { mode: "review" }>; lang: Lang; token: string; demo: boolean }) {
  const es = lang === "es";
  const [comment, setComment] = useState("");
  const [acked, setAcked] = useState(info.acked);
  const [busy, setBusy] = useState(false);
  const doc = info.doc.lang === lang || !info.docOther ? info.doc : info.docOther;
  const pip = !!doc.pip;
  return (
    <div className="my-rv-body wide">
      <ReviewDoc d={doc} accent={info.accent} />
      {info.signOff && (acked ? (
        <div className="my-rv-ok"><b>{es ? "Listo" : "All set"}</b> {es ? `${info.manager} puede ver que la recibió. Este enlace sigue funcionando si quiere volver a verla.` : `${info.manager} can see you received it. This link keeps working if you want to look back at it.`}</div>
      ) : (
        <section className="my-rv-ack">
          <label className="my-rv-q" htmlFor="c" style={{ fontSize: 17 }}>{es ? "Agregar un comentario (opcional)" : "Add a comment (optional)"}</label>
          <textarea id="c" className="my-rv-in" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={es ? "Lo que quiera que quede registrado" : "Anything you want on the record"} />
          <p className="my-rv-ack-text">{(pip ? ACK_TEXT_PIP : ACK_TEXT)[lang]}</p>
          <button className="btn primary block" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = demo ? { ok: true } : await fetch(`/api/my-review/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ack", comment }) }).then((x) => x.json()).catch(() => ({ ok: false }));
            setBusy(false);
            if (r.ok) setAcked(true);
          }}>{es ? "La recibí" : "I've received it"}</button>
        </section>
      ))}
      {!info.docOther && info.doc.lang !== lang && <p className="tiny muted" style={{ textAlign: "center" }}>{es ? "Esta evaluación se escribió en inglés." : "This review was written in Spanish."}</p>}
    </div>
  );
}
