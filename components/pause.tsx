"use client";

// The Pause: five minutes for yourself. An hourglass, one prompt, a closing thought.
// No sign-in and nothing to fill out. Private notes stay on this device only.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PARTNER, hasSpanish, monthSlug, PAUSE_SEED, pauseMonthLabel, PausePartner, PauseRitual, PILLAR_DEFAULT, PILLAR_NAME, PILLARS, published, wordsFor } from "@/lib/pause";
import { DEMO_ACCENT, DEMO_COMPANY } from "@/lib/state";
import { LIVE } from "@/lib/supabase";

type Lang = "en" | "es";
type Company = { name: string; accent: string; logo: string | null };

const T = {
  en: { tag: "Five minutes for yourself.", min: (n: number) => `${n} minutes`, start: "Start", resume: "Resume", pause: "Pause", reset: "Reset", prompt: "This month's prompt", doneK: "Done", again: "Do it again", reread: "Read the prompt again", note: "A private note, just for you", notePh: "Anything you want to remember. Only you can see this.", noteHint: "Saved on this device only. Nobody else can see it, including your employer.", past: "Past Pauses", sound: "Chime when done", by: "The Pause by Alza", nothing: "The next Pause is on its way. Check back soon.", missing: "This link isn't working. Ask HR for a new one.", thrive: "This month in Thrive", book: "Book a free 1:1", soon: "Booking opens soon", open: "Open", private: (w: string) => `Booked directly with ${w}. Your employer never sees who books.` },
  es: { tag: "Cinco minutos para ti.", min: (n: number) => `${n} minutos`, start: "Empezar", resume: "Seguir", pause: "Pausar", reset: "Reiniciar", prompt: "La reflexión del mes", doneK: "Listo", again: "Hacerlo otra vez", reread: "Leer la reflexión otra vez", note: "Una nota privada, solo para ti", notePh: "Lo que quieras recordar. Solo tú puedes verlo.", noteHint: "Se guarda solo en este dispositivo. Nadie más puede verla, ni tu empleador.", past: "Pausas anteriores", sound: "Sonido al terminar", by: "La Pausa de Alza", nothing: "La próxima Pausa viene en camino. Vuelve pronto.", missing: "Este enlace no funciona. Pide uno nuevo a Recursos Humanos.", thrive: "Este mes en Thrive", book: "Agendar 1:1 gratis", soon: "Muy pronto podrás agendar", open: "Abrir", private: (w: string) => `Se agenda directo con ${w}. Tu empleador nunca ve quién agenda.` },
};

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export function PauseView({ token, slug }: { token: string; slug?: string }) {
  const demo = !LIVE || token === "demo";
  const [company, setCompany] = useState<Company | null>(null);
  const [list, setList] = useState<PauseRitual[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [partner, setPartner] = useState<PausePartner>(DEFAULT_PARTNER);

  useEffect(() => {
    const saved = store.get("alza-pause-lang");
    setLang(saved === "es" || (!saved && navigator.language?.toLowerCase().startsWith("es")) ? "es" : "en");
    if (demo) {
      setCompany({ name: DEMO_COMPANY, accent: DEMO_ACCENT, logo: null });
      setList(published(PAUSE_SEED));
      return;
    }
    fetch(`/api/pause/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? (setCompany(j.company), setList(j.rituals), j.partner && setPartner(j.partner)) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [token, demo]);

  const month = useMemo(() => {
    if (!list?.length) return null;
    const want = slug ? list.find((r) => monthSlug(r.month) === slug || r.month === slug) : null;
    return want ?? list[0];
  }, [list, slug]);

  const t = T[lang];
  if (missing) return <Shell><p className="pz-empty">{T[lang].missing}</p></Shell>;
  if (!list || !company) return <Shell><div style={{ minHeight: 400 }} /></Shell>;
  if (!month) return <Shell company={company}><p className="pz-empty">{t.nothing}</p></Shell>;

  const canEs = hasSpanish(month);
  const pickLang = (l: Lang) => { setLang(l); store.set("alza-pause-lang", l); };
  return (
    <Shell company={company} langs={canEs ? { lang, pick: pickLang } : undefined} lang={lang}>
      <Ritual key={month.month} r={month} lang={canEs ? lang : "en"} token={token} demo={demo} />
      <ThriveStrip r={month} lang={canEs ? lang : "en"} token={token} demo={demo} partner={partner} />
      {list.length > 1 && (
        <section className="pz-past">
          <h2>{t.past}</h2>
          {list.filter((r) => r.month !== month.month).map((r) => {
            const w = wordsFor(r, canEs ? lang : "en");
            return (
              <Link key={r.month} href={`/pause/${token}/${monthSlug(r.month)}`} className="pz-past-row">
                <span><b>{w.title}</b><span>{pauseMonthLabel(r.month, lang)} · {w.theme}</span></span>
                <i aria-hidden="true">→</i>
              </Link>
            );
          })}
        </section>
      )}
    </Shell>
  );
}

function Shell({ children, company, langs, lang = "en" }: { children: React.ReactNode; company?: Company; langs?: { lang: Lang; pick: (l: Lang) => void }; lang?: Lang }) {
  return (
    <div className="pz">
      <header className="pz-top">
        <div>
          <div className="pz-mark">THE PAUSE</div>
          <div className="pz-tag">{T[lang].tag}</div>
        </div>
        {langs && (
          <div className="pz-lang" role="group" aria-label="Language">
            <button className={langs.lang === "en" ? "on" : ""} onClick={() => langs.pick("en")}>EN</button>
            <button className={langs.lang === "es" ? "on" : ""} onClick={() => langs.pick("es")}>ES</button>
          </div>
        )}
      </header>
      <main className="pz-main">{children}</main>
      <footer className="pz-foot">{company ? `${company.name} · ` : ""}{T[lang].by}</footer>
    </div>
  );
}

function Ritual({ r, lang, token, demo }: { r: PauseRitual; lang: Lang; token: string; demo: boolean }) {
  const t = T[lang];
  const w = wordsFor(r, lang);
  const total = (r.minutes ?? 5) * 60_000;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [sound, setSound] = useState(false);
  const [note, setNote] = useState("");
  const endsAt = useRef(0);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const noteKey = `alza-pause-note:${token}:${r.month}`;

  const log = useCallback((event: "visit" | "start" | "complete") => {
    if (demo) return;
    fetch(`/api/pause/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: r.month, event }), keepalive: true }).catch(() => {});
  }, [demo, token, r.month]);

  useEffect(() => {
    setSound(store.get("alza-pause-sound") === "1");
    setNote(store.get(noteKey) ?? "");
    try {
      const k = `alza-pause-seen:${r.month}`;
      if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); log("visit"); }
    } catch { log("visit"); }
  }, [noteKey, r.month, log]);

  const keepAwake = async (on: boolean) => {
    try {
      if (on) lock.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
      else { await lock.current?.release(); lock.current = null; }
    } catch {}
  };

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const l = Math.max(0, endsAt.current - Date.now());
      setLeft(l);
      if (l <= 0) {
        setRunning(false);
        setDone(true);
        keepAwake(false);
        log("complete");
        if (sound) chime();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running, sound, log]);

  const start = () => {
    endsAt.current = Date.now() + left;
    setRunning(true);
    keepAwake(true);
    if (!started) { setStarted(true); log("start"); }
  };
  const pause = () => { setRunning(false); keepAwake(false); };
  const reset = () => { setRunning(false); setDone(false); setStarted(false); setLeft(total); keepAwake(false); };
  const toggleSound = () => { const v = !sound; setSound(v); store.set("alza-pause-sound", v ? "1" : "0"); if (v) chime(true); };

  const progress = 1 - left / total;
  const mm = Math.floor(Math.ceil(left / 1000) / 60);
  const ss = Math.ceil(left / 1000) % 60;
  const steps = w.steps ?? [];
  const stepAt = started ? Math.min(steps.length - 1, Math.floor(progress * steps.length)) : -1;

  return (
    <>
      <section className="pz-intro">
        <div className="pz-kicker">{pauseMonthLabel(r.month, lang)} · {w.theme}</div>
        <h1>{w.title}</h1>
        <p>{w.intro}</p>
        <div className="pz-min">{t.min(r.minutes ?? 5)}</div>
      </section>

      <section className="pz-timer" aria-label="Timer">
        <Hourglass p={progress} running={running} done={done} />
        <div className="pz-clock" aria-live="off" role="timer">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
        {!done ? (
          <div className="pz-btns">
            {running ? <button className="pz-btn" onClick={pause}>{t.pause}</button> : <button className="pz-btn gold" onClick={start}>{started ? t.resume : t.start}</button>}
            {started && <button className="pz-btn ghost" onClick={reset}>{t.reset}</button>}
          </div>
        ) : null}
        <label className="pz-sound"><input type="checkbox" checked={sound} onChange={toggleSound} /> {t.sound}</label>
      </section>

      <section className="pz-prompt" ref={promptRef}>
        <div className="pz-kicker light">{t.prompt}</div>
        <p className="pz-q">{w.prompt}</p>
        {steps.length > 0 && (
          <ol className="pz-steps">
            {steps.map((s, i) => <li key={i} className={i === stepAt ? "on" : i < stepAt || done ? "past" : ""}>{s}</li>)}
          </ol>
        )}
      </section>

      {done && (
        <section className="pz-close">
          <div className="pz-kicker">{t.doneK}</div>
          <p>{w.closing}</p>
          <div className="pz-btns">
            <button className="pz-btn gold" onClick={reset}>{t.again}</button>
            <button className="pz-btn ghost" onClick={() => promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>{t.reread}</button>
          </div>
        </section>
      )}

      <details className="pz-note" open={!!note}>
        <summary>{t.note}</summary>
        <textarea value={note} placeholder={t.notePh} onChange={(e) => { setNote(e.target.value); store.set(noteKey, e.target.value); }} />
        <p>{t.noteHint}</p>
      </details>
    </>
  );
}

/** One nudge per Thrive pillar, tied to the month's theme. The financial one books Ben's partner directly. */
function ThriveStrip({ r, lang, token, demo, partner }: { r: PauseRitual; lang: Lang; token: string; demo: boolean; partner: PausePartner }) {
  const t = T[lang];
  const w = wordsFor(r, lang);
  const who = [partner.name, partner.firm].filter(Boolean).join(lang === "es" ? " de " : " at ");
  const coach = () => {
    if (demo) return;
    fetch(`/api/pause/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: r.month, event: "coach" }), keepalive: true }).catch(() => {});
  };
  return (
    <section className="pz-thrive">
      <div className="pz-kicker">{t.thrive}</div>
      {PILLARS.map((p) => (
        <div key={p} className={`pz-th pz-th-${p}`}>
          <div className="pz-th-name">{PILLAR_NAME[lang][p]}</div>
          <p>{w.thrive?.[p] || r.thrive?.[p] || PILLAR_DEFAULT[lang][p]}</p>
          {p === "financial" ? (
            partner.url ? (
              <>
                <a className="pz-th-cta" href={partner.url} target="_blank" rel="noopener noreferrer" onClick={coach}>{t.book}{who ? ` · ${who}` : ""}</a>
                <small>{t.private(who || "the coach")}</small>
              </>
            ) : demo ? (
              <Link className="pz-th-cta" href="/thrive/demo#financial">{t.book}{who ? ` · ${who}` : ""}</Link>
            ) : (
              <span className="pz-th-soon">{t.soon}</span>
            )
          ) : demo ? (
            <Link className="pz-th-cta" href={p === "connection" ? "/shout/demo" : "/thrive/demo#physical"}>{t.open}</Link>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/** An hourglass whose sand really falls: p = 0 at the start, 1 when time is up. */
function Hourglass({ p, running, done }: { p: number; running: boolean; done: boolean }) {
  const glass = "M44 22 C44 74 74 102 77 118 L77 122 C74 138 44 166 44 218 L116 218 C116 166 86 138 83 122 L83 118 C86 102 116 74 116 22 Z";
  const topY = 34 + p * 84; // upper sand surface sinks toward the neck
  const pile = 218 - Math.min(1, p) * 66; // lower pile rises
  return (
    <svg className={`pz-glass ${running ? "run" : ""} ${done ? "done" : ""}`} viewBox="0 0 160 240" role="img" aria-label="Hourglass">
      <defs>
        <clipPath id="pz-in"><path d={glass} /></clipPath>
        <linearGradient id="pz-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dcc398" /><stop offset="1" stopColor="#c09c66" /></linearGradient>
      </defs>
      <rect x="22" y="8" width="116" height="12" rx="4" className="pz-cap" />
      <rect x="22" y="220" width="116" height="12" rx="4" className="pz-cap" />
      <line x1="30" y1="20" x2="30" y2="220" className="pz-post" />
      <line x1="130" y1="20" x2="130" y2="220" className="pz-post" />
      <path d={glass} className="pz-bulb" />
      <g clipPath="url(#pz-in)">
        {p < 1 && <path d={`M30 ${topY + 4} Q80 ${topY - 4} 130 ${topY + 4} L130 121 L30 121 Z`} fill="url(#pz-sand)" />}
        {p > 0 && <path d={`M30 240 L30 ${pile + 10} Q80 ${pile - 10} 130 ${pile + 10} L130 240 Z`} fill="url(#pz-sand)" />}
        {running && p < 1 && <line x1="80" y1="119" x2="80" y2={pile} className="pz-stream" />}
      </g>
      <path d={glass} className="pz-rim" />
    </svg>
  );
}

function chime(soft = false) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = soft ? [880] : [660, 880, 1320];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const at = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.18, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 1.7);
    });
  } catch {}
}
