"use client";

// Shared pieces of Alza Perform: the finished review document, status chips, the language switch,
// and "Talk it through" (the phone's own speech-to-text: no recording is kept).
import { TrText } from "./trtext";
import { useEffect, useRef, useState } from "react";
import { Doc, fmtDay, GOAL_STATUS, Lang, Stage, STAGE_LABEL } from "@/lib/perform";
import { useStore } from "@/lib/store";
import { performFor, type PerformSettings } from "@/lib/perform";

/** The finished review, laid out cleanly for the screen, print/PDF and the employee's page. */
/** readerLang: the person reading (a manager), so the employee's comment shows in their language too. */
export function ReviewDoc({ d, accent, readerLang }: { d: Doc; accent: string; readerLang?: "en" | "es" }) {
  const es = d.lang === "es";
  const L2 = (en: string, s: string) => (es ? s : en);
  return (
    <article className="pf-doc" style={{ ["--pf" as string]: accent }}>
      <header className="pf-doc-head">
        <div>
          <h1>{d.title}</h1>
          <p>{d.company}</p>
        </div>
        <dl>
          <div><dt>{L2("Employee", "Empleado/a")}</dt><dd>{d.name}</dd></div>
          {d.jobTitle && <div><dt>{L2("Position", "Puesto")}</dt><dd>{d.jobTitle}</dd></div>}
          {d.department && <div><dt>{L2("Department", "Departamento")}</dt><dd>{d.department}</dd></div>}
          <div><dt>{L2("Manager", "Gerente")}</dt><dd>{d.manager}</dd></div>
          {d.hireDate && <div><dt>{L2("Hire date", "Ingreso")}</dt><dd>{fmtDay(d.hireDate, d.lang)}</dd></div>}
          <div><dt>{L2("Period", "Periodo")}</dt><dd>{d.period}</dd></div>
          <div><dt>{L2("Date", "Fecha")}</dt><dd>{d.date}</dd></div>
        </dl>
      </header>

      {d.rated.length > 0 && (
        <section>
          <h2>{L2("Ratings", "Calificaciones")}</h2>
          <table className="pf-rates">
            <tbody>
              {d.rated.map((x) => (
                <tr key={x.name}>
                  <th scope="row">{x.name}{x.note && <span>{x.note}</span>}</th>
                  <td><b>{x.value}</b> {x.label}</td>
                </tr>
              ))}
              {d.overall && (
                <tr className="pf-overall">
                  <th scope="row">{L2("Overall", "General")}</th>
                  <td><b>{d.overall.value}</b> {d.overall.label}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      {!d.rated.length && d.overall && <p className="pf-overall-line"><b>{L2("Overall", "General")}:</b> {d.overall.value} · {d.overall.label}</p>}

      {d.written.map((w) => (
        <section key={w.q}>
          <h2>{w.q}</h2>
          <p className="pf-prose">{w.a}</p>
        </section>
      ))}

      {d.pip && (
        <>
          <section>
            <h2>{L2("What needs to change", "Qué necesita cambiar")}</h2>
            <ol className="pf-issues">
              {d.pip.issues.filter((i) => i.what).map((i) => (
                <li key={i.id}>
                  <p className="pf-prose"><b>{i.what}</b></p>
                  {i.expected && <p><span>{L2("Expected", "Se espera")}</span>{i.expected}</p>}
                  {i.support && <p><span>{L2("Support", "Apoyo")}</span>{i.support}</p>}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2>{L2("Timeline", "Plazos")}</h2>
            <p>{L2("Starts", "Empieza")} {fmtDay(d.pip.start, d.lang)} · {d.pip.length} {L2("days", "días")}</p>
            <ul className="pf-dates">{d.pip.checkins.map((c) => <li key={c.date}>{L2("Check-in", "Seguimiento")} · {fmtDay(c.date, d.lang)}</li>)}</ul>
          </section>
          <section>
            <h2>{L2("At the end of the plan", "Al final del plan")}</h2>
            <p className="pf-prose">{d.pip.outcome}</p>
          </section>
        </>
      )}

      {d.goals.length > 0 && (
        <section>
          <h2>{L2("Goals for the next review", "Metas para la próxima evaluación")}</h2>
          <ul className="pf-goals">
            {d.goals.map((g) => (
              <li key={g.text}><b>{g.text}</b>{(g.measure || g.by) && <span>{[g.measure, g.by && `${L2("by", "para")} ${g.by}`].filter(Boolean).join(" · ")}</span>}</li>
            ))}
          </ul>
        </section>
      )}

      {d.comment && (
        <section>
          <h2>{L2("Employee comments", "Comentarios del empleado/a")}</h2>
          {readerLang ? <TrText className="pf-prose" text={d.comment} to={readerLang} /> : <p className="pf-prose">{d.comment}</p>}
        </section>
      )}

      <footer className="pf-ack">
        <p>{d.ackText}</p>
        <div className="pf-sign">
          <div><span>{L2("Manager completed", "Gerente completó")}</span><b>{d.managerDone || " "}</b></div>
          <div><span>{d.ackHow === "person" ? L2("Delivered in person", "Entregada en persona") : L2("Employee acknowledged", "Empleado/a confirmó")}</span><b>{d.ack || " "}</b></div>
        </div>
      </footer>
    </article>
  );
}

const STAGE_TONE: Record<Stage, string> = { upcoming: "", not_started: "", in_progress: "blue", ready: "gold", waiting: "gold", done: "green", overdue: "red", cancelled: "" };
export const StageChip = ({ st, lang }: { st: Stage; lang: Lang }) => <span className={`pf-chip ${STAGE_TONE[st]}`}>{STAGE_LABEL[st][lang]}</span>;
export const GoalChip = ({ s, lang }: { s: keyof typeof GOAL_STATUS; lang: Lang }) => <span className="pf-chip">{GOAL_STATUS[s][lang]}</span>;

/** The manager's language for the review screens. Remembered on this device. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      const v = localStorage.getItem("alza-perform-lang");
      if (v === "es" || v === "en") setLang(v);
      else if (navigator.language?.toLowerCase().startsWith("es")) setLang("es");
    } catch {}
  }, []);
  return [lang, (l: Lang) => { setLang(l); try { localStorage.setItem("alza-perform-lang", l); } catch {} }];
}
export function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="pf-lang" role="group" aria-label="Language">
      <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => onChange("en")}>English</button>
      <button className={lang === "es" ? "on" : ""} aria-pressed={lang === "es"} onClick={() => onChange("es")}>Español</button>
    </div>
  );
}

/** For the public demo: the pieces the in-browser Perform needs from the store. */
export function useDemo(clientId: string) {
  const { people, checkins, config, patch, viewer, me, getClient } = useStore();
  const cfg = config[clientId];
  return {
    people,
    checkins,
    settings: cfg?.perform,
    company: getClient(clientId)?.name ?? "",
    users: (cfg?.users ?? []).map((u) => ({ name: u.name, email: u.email.toLowerCase(), access: u.access as string })),
    me: { email: viewer?.kind === "client" ? (me?.email ?? "").toLowerCase() : "ben@alzapc.com", name: viewer?.kind === "client" ? viewer.person.name : "HR", advisor: viewer?.kind === "advisor", exec: me?.access === "exec" },
    saveSettings: (s: PerformSettings) => cfg && patch({ config: { ...config, [clientId]: { ...cfg, perform: s } } }),
  };
}
export const settingsOf = (x?: Partial<PerformSettings>) => performFor(x);

// ---------- Talk it through ----------
type Rec = { start: () => void; stop: () => void; abort: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const recognizer = (): (new () => Rec) | null => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null));

/** Live speech-to-text. Returns the running transcript; nothing is recorded or stored.
 *  Phones end a listening session on their own after a pause (iPhone especially), so while the person
 *  still has the mic on we quietly start a new session and keep what was already heard. */
export function useTalk(lang: Lang) {
  const [on, setOn] = useState(false);
  const [text, setTextState] = useState("");
  const [err, setErr] = useState("");
  const rec = useRef<Rec | null>(null);
  const base = useRef(""); // text from earlier sessions (and anything typed)
  const latest = useRef(""); // always the newest text, for reading right after stopping
  const want = useRef(false); // the person still wants the mic on
  const session = useRef(0); // results from an older session are ignored
  const restarts = useRef(0);
  const [supported, setSupported] = useState(false); // known only in the browser
  useEffect(() => setSupported(!!recognizer()), []);
  const setText = (t: string) => { latest.current = t; setTextState(t); };

  const open = (): boolean => {
    const R = recognizer();
    if (!R) return false;
    const id = ++session.current;
    const r = new R();
    r.lang = lang === "es" ? "es-US" : "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      if (id !== session.current) return;
      let finalT = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalT += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setText(`${base.current ? base.current + " " : ""}${finalT}${interim}`.replace(/\s+/g, " ").trim());
    };
    r.onerror = (e) => {
      if (id !== session.current) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { want.current = false; setErr("denied"); }
      else if (e.error !== "no-speech" && e.error !== "aborted") setErr(e.error);
    };
    r.onend = () => {
      if (id !== session.current) return;
      if (want.current && restarts.current < 30) {
        restarts.current++;
        base.current = latest.current.trim();
        setTimeout(() => { if (want.current && id === session.current && !open()) { want.current = false; setOn(false); } }, 120);
      } else {
        want.current = false;
        setOn(false);
      }
    };
    rec.current = r;
    try {
      r.start();
      return true;
    } catch {
      return false;
    }
  };

  const start = (keep = true) => {
    if (!recognizer()) return setErr("unsupported");
    if (typeof window !== "undefined") window.speechSynthesis?.cancel(); // don't listen to ourselves
    setErr("");
    base.current = keep ? latest.current.trim() : "";
    if (!keep) setText("");
    want.current = true;
    restarts.current = 0;
    if (open()) setOn(true);
    else { want.current = false; setErr("start"); }
  };
  const stop = () => { want.current = false; rec.current?.stop(); setOn(false); };
  /** Stop and give back everything heard, waiting a moment for the last words to come in. */
  const finish = async (): Promise<string> => {
    if (want.current || on) {
      want.current = false;
      rec.current?.stop();
      await new Promise((res) => setTimeout(res, 600));
      session.current++;
      setOn(false);
    }
    return latest.current.trim();
  };
  /** Empty the box and drop anything still arriving from the last session. */
  const clear = () => { session.current++; want.current = false; try { rec.current?.abort(); } catch {} base.current = ""; setText(""); setOn(false); };
  useEffect(() => () => { want.current = false; rec.current?.abort(); }, []);
  return { on, text, setText, err, supported, start, stop, finish, clear };
}
