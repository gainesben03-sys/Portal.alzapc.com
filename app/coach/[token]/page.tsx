"use client";

// MOCKUP: Review coach. Walks a manager through a review one question at a time, by voice or typing,
// asks a follow-up when an answer is thin, then drafts the review in the manager's own words.
// The demo uses simple rules for follow-ups and the draft; the real one would use the AI with the same guardrails.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTalk } from "@/components/perform";
import { DEMO_COMPANY } from "@/lib/state";

type Lang = "en" | "es";
type Step = { id: "strengths" | "focus" | "support" | "goals" | "else"; q: Record<Lang, string>; follow: Record<Lang, string>; nudge: Record<Lang, string> };

const WHO = { first: "Jordan", full: "Jordan Lee", title: "Warehouse Associate", manager: "Dana" };

const STEPS: Step[] = [
  { id: "strengths", q: { en: `Let's start with what's going well. What are ${WHO.first}'s biggest strengths?`, es: `Empecemos por lo que va bien. ¿Cuáles son las mayores fortalezas de ${WHO.first}?` }, follow: { en: "Nice. Can you give me a quick example of when you saw that?", es: "Bien. ¿Me das un ejemplo rápido de cuándo lo viste?" }, nudge: { en: 'No problem. Think about the last couple of weeks. What\'s one thing Jordan does that you\'d want everyone on the team to do?', es: 'No pasa nada. Piensa en las últimas semanas. ¿Qué hace Jordan que te gustaría que todo el equipo hiciera?' } },
  { id: "focus", q: { en: `What are one or two things you'd like ${WHO.first} to focus on next?`, es: `¿En qué una o dos cosas te gustaría que ${WHO.first} se enfoque ahora?` }, follow: { en: "What would good look like there?", es: "¿Cómo se vería hacerlo bien?" }, nudge: { en: 'That\'s okay. If Jordan got better at one thing by the next review, what would make the biggest difference?', es: 'Está bien. Si Jordan mejorara en una sola cosa para la próxima evaluación, ¿qué haría la mayor diferencia?' } },
  { id: "support", q: { en: `What will help ${WHO.first} get there? Anything you'll do to support them?`, es: `¿Qué ayudará a ${WHO.first} a lograrlo? ¿Qué harás tú para apoyarle?` }, follow: { en: "Is there anything specific, like training or time with someone on the team?", es: "¿Algo específico, como capacitación o tiempo con alguien del equipo?" }, nudge: { en: 'Fair enough. Would training, more time with you, or pairing with a teammate help most?', es: 'Entendido. ¿Qué ayudaría más: capacitación, más tiempo contigo o trabajar con un compañero?' } },
  { id: "goals", q: { en: `What goals do you have for ${WHO.first} over the next 90 days?`, es: `¿Qué metas tienes para ${WHO.first} en los próximos 90 días?` }, follow: { en: "How will you both know it's done? A number or a date helps.", es: "¿Cómo sabrán que se logró? Un número o una fecha ayuda." }, nudge: { en: 'Let\'s keep it simple. What\'s one thing you\'d like to see Jordan do by the end of the next 90 days?', es: 'Hagámoslo simple. ¿Qué te gustaría ver que Jordan logre en los próximos 90 días?' } },
  { id: "else", q: { en: `Anything else you want ${WHO.first} to hear?`, es: `¿Algo más que quieras que ${WHO.first} escuche?` }, follow: { en: "", es: "" }, nudge: { en: '', es: '' } },
];

const T = {
  en: { title: `${WHO.first}'s 90-day review`, sub: "Talk it through. I'll turn it into a draft.", tap: "Tap to talk", stop: "Done talking", type: "Or type here", next: "Next", skip: "Skip", read: "Read questions aloud", draft: "Here's your draft", draftSub: "In your words, cleaned up. Change anything before you use it.", use: "Use this draft", redo: "Start over", s: "Strengths", f: "Areas to focus on", sp: "Support", g: "Goals for the next 90 days", e: "Manager's note", flag: "Keep the review about work. Leave out anything about health, leave, family or personal life.", none: "Nothing yet", used: "In the real version this fills in the review form. You can still edit every word.", mock: "Mockup with sample data", hint: "No ratings or scores here. You'll set those yourself on the form.", more: "Can you say a bit more? A sentence or two is plenty.", ok: "No problem.", fit: "Got it, I added that under how you'll support Jordan. What's the goal for Jordan? Something Jordan will do or reach by the end of the 90 days.", last: "No pressure. Anything at all, even a rough thought, helps. Or tap Skip and come back to it.", later: "Let's leave that one for you to fill in later.", gap: "Needs your input", gaps: (n: number) => `${n} ${n === 1 ? "section needs" : "sections need"} your input before this goes to HR.` },
  es: { title: `Evaluación de 90 días de ${WHO.first}`, sub: "Cuéntamelo y lo convierto en un borrador.", tap: "Toca para hablar", stop: "Terminé", type: "O escribe aquí", next: "Siguiente", skip: "Omitir", read: "Leer las preguntas en voz alta", draft: "Tu borrador", draftSub: "Con tus palabras, ordenadas. Cambia lo que quieras antes de usarlo.", use: "Usar este borrador", redo: "Empezar de nuevo", s: "Fortalezas", f: "Áreas de enfoque", sp: "Apoyo", g: "Metas para los próximos 90 días", e: "Nota del gerente", flag: "Mantén la evaluación sobre el trabajo. No incluyas salud, permisos, familia ni vida personal.", none: "Nada todavía", used: "En la versión real esto llena el formulario. Puedes editar cada palabra.", mock: "Maqueta con datos de ejemplo", hint: "Aquí no hay calificaciones. Esas las pones tú en el formulario.", more: "¿Puedes decir un poco más? Una o dos frases bastan.", ok: "No pasa nada.", fit: "Entendido, lo agregué en cómo apoyarás a Jordan. ¿Cuál es la meta para Jordan? Algo que logre al final de los 90 días.", last: "Sin presión. Cualquier idea, aunque sea general, ayuda. O toca Omitir y vuelve después.", later: "Dejemos esa para que la completes después.", gap: "Falta tu respuesta", gaps: (n: number) => `${n} ${n === 1 ? "sección necesita" : "secciones necesitan"} tu respuesta antes de enviarla a RR. HH.` },
};

const SENSITIVE = /\b(pregnan\w*|medical|doctor|surgery|sick|illness|disab\w*|leave of absence|maternity|paternity|religio\w*|church|age|too old|young|kids|childcare|divorce|accent|embaraz\w*|médic\w*|enferm\w*|discapacidad|religi\w*|edad|hijos)\b/i;
const thin = (s: string) => s.trim().split(/\s+/).filter(Boolean).length < 12;
/** "IDK", "not sure", "n/a"...: not an answer, so it never goes in the review. */
const NON = /^(i\s*d(on'?|o not)?\s*k(now)?|idk|dunno|no idea|not sure|unsure|n\/?a|none|nothing|no|nope|pass|skip|\?+|-+|\.+|no s[eé]|ni idea|nada|ninguno|no estoy segur[oa])[.!?\s]*$/i;
const nonAnswer = (s: string) => NON.test(s.trim());
/** Too little to use, or not words: ask for a bit more. (The real version also checks it fits the question.) */
const unclear = (s: string) => { const w = s.trim().split(/\s+/).filter(Boolean); const letters = s.replace(/[^a-záéíóúñ]/gi, ""); return w.length < 4 || letters.length < 8 || /(.)\1{3,}/.test(s) || !/[aeiouáéíóú]/i.test(s); };

type Msg = { from: "coach" | "me"; text: string; flag?: boolean };

/** Light cleanup of spoken text: capital letters, end punctuation, filler words out. */
function tidy(s: string) {
  const t = s.replace(/\b(um+|uh+|like,|you know,?|kind of|sort of|basically)\b,?\s*/gi, "").replace(/\s*,\s*,/g, ",").replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const sentences = t.split(/(?<=[.!?])\s+/).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const out = sentences.join(" ");
  return /[.!?]$/.test(out) ? out : out + ".";
}
const bullets = (s: string) => tidy(s).split(/(?<=[.!?])\s+|;\s+|\band also\b|\balso,?\s/i).map((x) => x.trim().replace(/^and\s+/i, "")).filter((x) => x.length > 3).map((x) => x.charAt(0).toUpperCase() + x.slice(1).replace(/[.!?]?$/, "."));

export default function Coach() {
  const [lang, setLang] = useState<Lang>("en");
  const L = T[lang];
  const talk = useTalk(lang);
  const [i, setI] = useState(0);
  const [followed, setFollowed] = useState(false);
  const [tries, setTries] = useState<Record<string, number>>({});
  const [gaps, setGaps] = useState<string[]>([]);
  const [fitAsked, setFit] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "coach", text: STEPS[0].q.en }]);
  const [aloud, setAloud] = useState(false);
  const [done, setDone] = useState(false);
  const [used, setUsed] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const say = (text: string) => {
    if (!aloud || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "es" ? "es-US" : "en-US";
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  };

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, done]);

  const ask = (text: string) => { setMsgs((m) => [...m, { from: "coach", text }]); say(text); };

  const send = (skip = false) => {
    if (talk.on) talk.stop();
    const said = skip ? "" : talk.text.trim();
    talk.setText("");
    const step = STEPS[i];
    // not an answer: nudge with an easier version of the question, up to twice, then leave it for the manager
    if (said && (nonAnswer(said) || unclear(said)) && step.id !== "else") {
      setMsgs((m) => [...m, { from: "me", text: said }]);
      if (answers[step.id]) return next(L.ok); // they already answered; this was the follow-up, so move on
      const n = (tries[step.id] ?? 0) + 1;
      setTries((t) => ({ ...t, [step.id]: n }));
      if (n === 1) return ask(nonAnswer(said) ? step.nudge[lang] : L.more);
      if (n === 2 && nonAnswer(said)) return ask(L.last);
      if (!answers[step.id]) setGaps((g) => [...new Set([...g, step.id])]);
      return next(L.later);
    }
    if (said && step.id === "else" && (nonAnswer(said) || unclear(said))) { setMsgs((m) => [...m, { from: "me", text: said }]); return next(); }
    // an answer that fits a different question: point it back (the real version checks every answer this way)
    if (said && step.id === "goals" && /^(i will|i'll|i can|i am going to|yo voy a|le voy a)\b/i.test(said) && !fitAsked[step.id]) {
      setFit((f) => ({ ...f, [step.id]: true }));
      setMsgs((m) => [...m, { from: "me", text: said }]);
      setAnswers((a) => ({ ...a, support: `${a.support ? tidy(a.support) + " " : ""}${said}` }));
      setGaps((g) => g.filter((x) => x !== "support"));
      return ask(L.fit);
    }
    if (said) {
      setMsgs((m) => [...m, { from: "me", text: said }, ...(SENSITIVE.test(said) ? [{ from: "coach" as const, text: L.flag, flag: true }] : [])]);
      setAnswers((a) => ({ ...a, [step.id]: `${a[step.id] ? tidy(a[step.id]) + " " : ""}${said}` }));
    }
    // one follow-up when the first answer is short
    if (said && !followed && step.follow[lang] && thin(said)) {
      setFollowed(true);
      return ask(step.follow[lang]);
    }
    if (skip && !answers[step.id] && step.id !== "else") setGaps((g) => [...new Set([...g, step.id])]);
    next();
  };

  const next = (lead = "") => {
    setFollowed(false);
    if (i + 1 < STEPS.length) {
      setI(i + 1);
      ask(`${lead ? lead + " " : ""}${STEPS[i + 1].q[lang]}`);
    } else {
      if (lead) ask(lead);
      setDone(true);
      say(L.draft);
    }
  };

  const restart = () => { setFit({}); setTries({}); setGaps([]); setI(0); setFollowed(false); setAnswers({}); setDone(false); setUsed(false); setMsgs([{ from: "coach", text: STEPS[0].q[lang] }]); };
  const switchLang = (l: Lang) => { setFit({}); setTries({}); setGaps([]); setLang(l); setI(0); setFollowed(false); setAnswers({}); setDone(false); setUsed(false); setMsgs([{ from: "coach", text: STEPS[0].q[l] }]); };

  const section = (title: string, text: string | undefined, list = false, id = "") => (
    <section className={`rc-sec ${!text && gaps.includes(id) ? "gap" : ""}`}>
      <h3>{title}</h3>
      {!text ? (gaps.includes(id) ? <p className="rc-gap" contentEditable suppressContentEditableWarning>{L.gap}</p> : <p className="muted">{L.none}</p>) : list ? <ul contentEditable suppressContentEditableWarning>{bullets(text).map((b) => <li key={b}>{b}</li>)}</ul> : <p contentEditable suppressContentEditableWarning>{tidy(text)}</p>}
    </section>
  );

  return (
    <div className="rc">
      <div className="rc-mock">{L.mock}</div>
      <header className="rc-top">
        <Link href="/" className="rc-back">‹</Link>
        <div className="grow">
          <h1>{L.title}</h1>
          <p>{WHO.title} · {DEMO_COMPANY}</p>
        </div>
        <div className="rc-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => switchLang("en")}>EN</button>
          <button className={lang === "es" ? "on" : ""} onClick={() => switchLang("es")}>ES</button>
        </div>
      </header>

      <div className="rc-progress" aria-hidden="true">{STEPS.map((s, k) => <i key={s.id} className={done || k < i ? "done" : k === i ? "on" : ""} />)}</div>

      <main className="rc-chat">
        <p className="rc-sub">{L.sub}</p>
        {msgs.map((m, k) => <div key={k} className={`rc-msg ${m.from}${m.flag ? " flag" : ""}`}>{m.text}</div>)}

        {done && (
          <div className="rc-draft">
            <h2>{L.draft}</h2>
            <p className="small muted">{L.draftSub}</p>
            {section(L.s, answers.strengths, false, "strengths")}
            {section(L.f, answers.focus, true, "focus")}
            {section(L.sp, answers.support, false, "support")}
            {section(L.g, answers.goals, true, "goals")}
            {answers.else && section(L.e, answers.else)}
            {gaps.filter((g) => !answers[g]).length > 0 && <p className="rc-gapnote">{L.gaps(gaps.filter((g) => !answers[g]).length)}</p>}
            <p className="tiny muted">{L.hint}</p>
            {used ? <p className="rc-used">{L.used}</p> : (
              <div className="rc-row">
                <button className="btn primary" onClick={() => setUsed(true)}>{L.use}</button>
                <button className="btn" onClick={restart}>{L.redo}</button>
              </div>
            )}
          </div>
        )}
        <div ref={end} />
      </main>

      {!done && (
        <footer className="rc-bar">
          {talk.supported && (
            <button className={`rc-mic ${talk.on ? "on" : ""}`} onClick={() => (talk.on ? talk.stop() : talk.start())} aria-label={talk.on ? L.stop : L.tap}>
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <span>{talk.on ? L.stop : L.tap}</span>
            </button>
          )}
          <textarea className="rc-input" rows={2} value={talk.text} onChange={(e) => talk.setText(e.target.value)} placeholder={L.type} />
          <div className="rc-row">
            <label className="rc-aloud"><input type="checkbox" checked={aloud} onChange={(e) => setAloud(e.target.checked)} /> {L.read}</label>
            <span className="grow" />
            <button className="btn" onClick={() => send(true)}>{L.skip}</button>
            <button className="btn primary" disabled={!talk.text.trim()} onClick={() => send()}>{L.next}</button>
          </div>
        </footer>
      )}
    </div>
  );
}
