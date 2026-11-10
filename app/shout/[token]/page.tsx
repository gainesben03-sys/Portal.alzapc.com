"use client";

// The page behind the QR code. No login: give a shoutout in about 20 seconds, see the wall, react.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChallengeCards, Pick, PersonSearch, Scoreboard, ShoutCard, WallItem } from "@/components/shoutui";
import { PublicChallenge, publicChallenge } from "@/lib/challenges";
import { Board, Celebration, celebrateLine, DEFAULT_HEADLINE, MAX_MESSAGE, shortName, ShoutTheme, STARTERS, themeVars } from "@/lib/recognition";
import { Burst } from "@/components/shoutui";
import { DEMO_CELEBRATE, DEMO_CHALLENGES, DEMO_PEOPLE, DEMO_ROSTER, DEMO_SHOUTS, DEMO_VALUES, demoBoard, demoReactions } from "@/lib/shoutdemo";

type Info = { company: string; accent: string; theme?: ShoutTheme | null; logo: string | null; values: string[]; sms: string | null; showWall: boolean; board: Board | null; wall: WallItem[]; celebrate: Celebration[]; challenges: PublicChallenge[]; pass: Pass | null };
type Pass = { id: string; title: string; link: number; holder: { id: string; name: string; team: string }; daysLeft: number; error?: string };
type Lang = "en" | "es";

const W = {
  en: { give: "Give a shoutout", wall: "Wall", who: "Who are you recognizing?", whoPh: "Start typing their name", what: "What did they do?", whatPh: "Be specific. What happened, and why it mattered.", value: "Which value does it show?", skip: "Skip", from: "Who's it from?", fromPh: "Find your name", notListed: "I'm not on the list", yourName: "Your name", send: "Send shoutout", sending: "Sending…", sentT: "Sent! 🎉", sentB: (n: string) => `${n} will get it right away.`, heldB: "Thanks! It'll post after a quick check.", another: "Recognize someone else", seeWall: "See the wall", text: (n: string) => `Or text a name to ${n}`, empty: "No shoutouts yet. Be the first.", private: "Shoutouts are checked before they post. Keep it about the work.", report: "Thanks. We'll take a look.", limit: "That's the limit for today. Thank you for recognizing so many people!", err: "That didn't send. Try again.", cel: "Celebrate", today: "Today", week: "This week", next: "Next week", newp: "New on the team", bday: "Birthday", anniv: (y: number) => `${y} ${y === 1 ? "year" : "years"} with the team`, started: "Started", starts: "Starts", sendOne: "Send a shoutout", noCel: "Nothing coming up in the next two weeks.", optNote: "Rather not have your birthday here? Use the link in your birthday email, or ask your manager.", passT: (n: number) => `You're link #${n - 1}. Pass it on!`, passB: (t: string, d: number) => `Keep the ${t} growing: recognize someone new${d > 0 ? ` in the next ${d === 1 ? "day" : `${d} days`}` : " today"}.`, passFrom: "From", passDone: (n: number) => `The chain grows! You added link #${n}. 🔗`, inChain: "They're already in the chain. Pick someone new so it keeps spreading!", chainOver: "This chain has ended, but you can still give a shoutout." },
  es: { give: "Dar un reconocimiento", wall: "Muro", who: "¿A quién quieres reconocer?", whoPh: "Escribe su nombre", what: "¿Qué hizo?", whatPh: "Sé específico. Qué pasó y por qué importó.", value: "¿Qué valor muestra?", skip: "Omitir", from: "¿De parte de quién?", fromPh: "Busca tu nombre", notListed: "No estoy en la lista", yourName: "Tu nombre", send: "Enviar", sending: "Enviando…", sentT: "¡Enviado! 🎉", sentB: (n: string) => `${n} lo recibirá enseguida.`, heldB: "¡Gracias! Se publicará después de una revisión rápida.", another: "Reconocer a alguien más", seeWall: "Ver el muro", text: (n: string) => `O manda un mensaje con un nombre al ${n}`, empty: "Aún no hay reconocimientos. Sé el primero.", private: "Los reconocimientos se revisan antes de publicarse. Habla del trabajo.", report: "Gracias. Lo revisaremos.", limit: "Llegaste al límite de hoy. ¡Gracias por reconocer a tantas personas!", err: "No se envió. Intenta de nuevo.", cel: "Celebrar", today: "Hoy", week: "Esta semana", next: "La próxima semana", newp: "Nuevos en el equipo", bday: "Cumpleaños", anniv: (y: number) => `${y} ${y === 1 ? "año" : "años"} con el equipo`, started: "Empezó", starts: "Empieza", sendOne: "Enviar un reconocimiento", noCel: "No hay nada en las próximas dos semanas.", optNote: "¿Prefieres que tu cumpleaños no aparezca aquí? Usa el enlace en tu correo de cumpleaños o habla con tu gerente.", passT: (n: number) => `Eres el eslabón #${n - 1}. ¡Pásalo!`, passB: (t: string, d: number) => `Haz crecer la ${t}: reconoce a alguien nuevo${d > 0 ? ` en los próximos ${d === 1 ? "día" : `${d} días`}` : " hoy"}.`, passFrom: "De", passDone: (n: number) => `¡La cadena crece! Agregaste el eslabón #${n}. 🔗`, inChain: "Esa persona ya está en la cadena. ¡Elige a alguien nuevo para que siga creciendo!", chainOver: "Esta cadena terminó, pero aún puedes dar un reconocimiento." },
};

function deviceId() {
  try {
    let d = localStorage.getItem("alza-shout-device");
    if (!d) {
      d = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("alza-shout-device", d);
    }
    return d;
  } catch {
    return "nostorage" + Math.random().toString(36).slice(2, 14);
  }
}

export default function ShoutPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<"give" | "celebrate" | "wall">("give");
  const [lang, setLang] = useState<Lang>("en");
  const [to, setTo] = useState<Pick | null>(null);
  const [from, setFrom] = useState<Pick | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "live" | "held">(null);
  const [toast, setToast] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const t = W[lang];

  const load = useCallback(async () => {
    const passQ = new URLSearchParams(window.location.search).get("pass");
    const r = await fetch(`/api/shout/${encodeURIComponent(token)}?d=${deviceId()}${passQ ? `&pass=${encodeURIComponent(passQ)}` : ""}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (r.ok) {
      setInfo(r);
      setState("ok");
    } else if (r.reason === "demo") {
      setDemo(true);
      setInfo({
        company: "Blueprint Studios",
        accent: "#2b3cf5",
        theme: (() => { try { return JSON.parse(localStorage.getItem("alza-demo-shout-theme") || "null"); } catch { return null; } })(),
        logo: null,
        values: DEMO_VALUES,
        sms: "+14155550123",
        showWall: true,
        celebrate: DEMO_CELEBRATE,
        challenges: DEMO_CHALLENGES.map((c) => publicChallenge(c, DEMO_SHOUTS, DEMO_ROSTER)),
        pass: passQ ? { id: passQ, title: "November Appreciation Chain", link: 5, holder: { id: "pp2", name: "Ana R.", team: "Install crew" }, daysLeft: 2 } : null,
        board: demoBoard(),
        wall: DEMO_SHOUTS.filter((s) => s.status === "live").map((s) => ({ id: s.id, to: shortName(s.to.name), team: s.to.department ?? "", from: shortName(s.from.name), value: s.value ?? null, message: s.message, at: s.at, reactions: demoReactions[s.id] ?? {}, mine: [] })),
      });
      setState("ok");
    } else setState("gone");
  }, [token]);

  useEffect(() => {
    load();
    try {
      const l = localStorage.getItem("alza-shout-lang");
      if (l === "es" || l === "en") setLang(l);
      else if (navigator.language.toLowerCase().startsWith("es")) setLang("es");
      const me = JSON.parse(localStorage.getItem("alza-shout-me") || "null");
      if (me?.id) setFrom(me);
    } catch {}
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) {
      setTab("wall");
      setFocus(s);
    }
  }, [load]);
  useEffect(() => {
    if (focus && info) setTimeout(() => document.getElementById(`s-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  }, [focus, info]);

  const search = useCallback(
    async (q: string): Promise<Pick[]> => {
      if (demo) return DEMO_PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => ({ ...p, name: shortName(p.name) }));
      const r = await fetch(`/api/shout/${encodeURIComponent(token)}?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({}));
      return r.people ?? [];
    },
    [demo, token]
  );

  const post = async (body: object) => {
    if (demo) return { ok: true, status: "live" };
    return fetch(`/api/shout/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, device: deviceId() }) }).then((x) => x.json()).catch(() => ({ ok: false }));
  };
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  const passing = info?.pass && !info.pass.error ? info.pass : null;
  const send = async () => {
    if (!to || msg.trim().length < 3 || (!passing && !from && !typed?.trim())) return;
    setBusy(true);
    const r = await post({ action: "give", to: to.id, fromId: passing ? passing.holder.id : from?.id, fromName: from || passing ? undefined : typed, value, message: msg, lang, pass: passing?.id });
    setBusy(false);
    if (!r.ok) return flash(r.reason === "limit" ? t.limit : r.reason === "self" ? "😄" : r.reason === "already_in_chain" ? t.inChain : r.reason?.startsWith("chain") ? t.chainOver : t.err);
    try {
      if (from) localStorage.setItem("alza-shout-me", JSON.stringify(from));
    } catch {}
    setDone(r.status === "held" ? "held" : "live");
    if (!demo) load();
  };
  const react = async (id: string, emoji: string) => {
    if (!info) return;
    const flip = (w: WallItem) => {
      if (w.id !== id) return w;
      const on = !w.mine.includes(emoji);
      return { ...w, mine: on ? [...w.mine, emoji] : w.mine.filter((e) => e !== emoji), reactions: { ...w.reactions, [emoji]: Math.max(0, (w.reactions[emoji] ?? 0) + (on ? 1 : -1)) } };
    };
    setInfo({ ...info, wall: info.wall.map(flip) });
    await post({ action: "react", id, emoji });
  };
  const report = async (id: string) => {
    await post({ action: "report", id });
    flash(t.report);
  };
  const reset = () => {
    setTo(null);
    setMsg("");
    setValue(null);
    setDone(null);
  };
  const setL = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("alza-shout-lang", l);
    } catch {}
  };

  if (state === "loading") return <div className="so-page"><p className="so-meta" style={{ textAlign: "center", marginTop: 90 }}>…</p></div>;
  if (state === "gone" || !info)
    return (
      <div className="so-page">
        <div className="so-panel" style={{ marginTop: 60 }}>
          <h1 className="so-h1">This shoutout link isn&apos;t active</h1>
          <p className="so-meta">Ask your manager for the current QR code.</p>
        </div>
      </div>
    );

  return (
    <div className={`so-page so-theme-${info.theme?.style ?? "classic"}`} style={themeVars(info.accent, info.theme ?? undefined)}>
      <header className="so-head">
        {info.logo ? <img src={info.logo} alt={info.company} className="so-logo" /> : <b>{info.company}</b>}
        <div className="so-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setL("en")}>EN</button>
          <button className={lang === "es" ? "on" : ""} onClick={() => setL("es")}>ES</button>
        </div>
      </header>
      <div className="so-hero">
        <span className="so-kicker">{lang === "es" ? "Reconocimientos" : "Shoutouts"}</span>
        <h1 className="so-h1">{lang === "es" ? info.theme?.headlineEs || DEFAULT_HEADLINE.es : info.theme?.headline || DEFAULT_HEADLINE.en}</h1>
      </div>
      {demo && <p className="so-demo">Demo preview with sample people.</p>}
      {(info.showWall || info.celebrate.length > 0) && (
        <div className="so-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${1 + (info.celebrate.length ? 1 : 0) + (info.showWall ? 1 : 0)}, 1fr)` }}>
          <button role="tab" aria-selected={tab === "give"} className={tab === "give" ? "on" : ""} onClick={() => setTab("give")}>{info.celebrate.length && info.showWall ? (lang === "es" ? "Dar" : "Give") : t.give}</button>
          {info.celebrate.length > 0 && <button role="tab" aria-selected={tab === "celebrate"} className={tab === "celebrate" ? "on" : ""} onClick={() => setTab("celebrate")}>🎂 {t.cel}{info.celebrate.some((c) => c.days === 0) ? <span className="so-dot" aria-label={t.today} /> : null}</button>}
          {info.showWall && <button role="tab" aria-selected={tab === "wall"} className={tab === "wall" ? "on" : ""} onClick={() => setTab("wall")}>{t.wall}{info.board ? ` · ${info.board.total}` : ""}</button>}
        </div>
      )}

      {tab === "give" ? (
        done ? (
          <div className="so-panel so-done">
            {info.theme?.burst !== false && <Burst />}
            <div className="so-burst" aria-hidden="true">🎉</div>
            <h2>{t.sentT}</h2>
            <p>{passing && done === "live" ? t.passDone(passing.link) : done === "live" ? t.sentB(to?.name.split(" ")[0] ?? "") : t.heldB}</p>
            <button className="so-btn" onClick={reset}>{t.another}</button>
            {info.showWall && <button className="so-link" onClick={() => { reset(); setTab("wall"); }}>{t.seeWall}</button>}
          </div>
        ) : (
          <div className="so-panel">
            {passing && (
              <div className="so-pass">
                <span className="so-kicker">🔗 {passing.title}</span>
                <b style={{ display: "block", marginTop: 2 }}>{t.passT(passing.link)}</b>
                <span className="so-meta">{t.passB(passing.title, passing.daysLeft)}</span>
              </div>
            )}
            {info.pass?.error && <p className="so-demo">{t.chainOver}</p>}
            <label className="so-label">{t.who}</label>
            <PersonSearch search={search} value={to} onPick={setTo} placeholder={t.whoPh} exclude={from?.id} />

            <label className="so-label">{t.what}</label>
            <div className="so-starters">
              {STARTERS[lang].map((s) => <button key={s} onClick={() => setMsg(s.replace("…", " "))}>{s}</button>)}
            </div>
            <textarea className="so-text" value={msg} onChange={(e) => setMsg(e.target.value.slice(0, MAX_MESSAGE))} placeholder={t.whatPh} rows={3} />
            <span className="so-count">{msg.length}/{MAX_MESSAGE}</span>

            <label className="so-label">{t.value}</label>
            <div className="so-values">
              {info.values.map((v) => <button key={v} className={value === v ? "on" : ""} onClick={() => setValue(value === v ? null : v)}>{v}</button>)}
            </div>

            <label className="so-label">{t.from}</label>
            {passing ? (
              <div className="so-picked"><span className="so-av sm" aria-hidden="true">{passing.holder.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span><b>{passing.holder.name}</b></div>
            ) : typed === null ? (
              <>
                <PersonSearch search={search} value={from} onPick={setFrom} placeholder={t.fromPh} exclude={to?.id} />
                {!from && <button className="so-link" onClick={() => setTyped("")}>{t.notListed}</button>}
              </>
            ) : (
              <>
                <input className="so-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.yourName} maxLength={60} />
                <button className="so-link" onClick={() => setTyped(null)}>← {t.fromPh}</button>
              </>
            )}

            <button className="so-btn" disabled={busy || !to || msg.trim().length < 3 || (!passing && !from && !typed?.trim())} onClick={send}>{busy ? t.sending : passing ? `🔗 ${t.send}` : t.send}</button>
            <p className="so-meta so-fine">{t.private}</p>
            {info.sms && <p className="so-meta so-fine">📱 {t.text(info.sms.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3"))}</p>}
          </div>
        )
      ) : tab === "celebrate" ? (
        <>
        <ChallengeCards list={info.challenges.filter((c) => c.kind === "welcome")} lang={lang} />
        <Celebrate list={info.celebrate} t={t} lang={lang} onShout={(c) => { reset(); setTo({ id: c.personId, name: c.name, team: c.team }); setMsg(celebrateLine(c, lang)); setTab("give"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        </>
      ) : (
        <>
          <ChallengeCards list={info.challenges} lang={lang} />
          {info.board && <Scoreboard b={info.board} />}
          {info.wall.length === 0 ? (
            <div className="so-panel so-meta">{t.empty}</div>
          ) : (
            <div className="so-wall">
              {info.wall.map((s) => <ShoutCard key={s.id} s={s} highlight={focus === s.id} onReact={(e) => react(s.id, e)} onReport={() => report(s.id)} />)}
            </div>
          )}
        </>
      )}
      {toast && <div className="so-toast" role="status">{toast}</div>}
    </div>
  );
}

function Celebrate({ list, t, lang, onShout }: { list: Celebration[]; t: (typeof W)["en"]; lang: Lang; onShout: (c: Celebration) => void }) {
  const groups: [string, Celebration[]][] = [
    [t.today, list.filter((c) => c.days === 0 && c.kind !== "new")],
    [t.week, list.filter((c) => c.days >= 1 && c.days <= 7 && c.kind !== "new")],
    [t.next, list.filter((c) => c.days >= 8 && c.kind !== "new")],
    [t.newp, list.filter((c) => c.kind === "new")],
  ];
  if (!list.length) return <div className="so-panel so-meta">{t.noCel}</div>;
  return (
    <div className="so-cel">
      {groups.filter(([, g]) => g.length).map(([label, g]) => (
        <section key={label}>
          <h3 className="so-cel-h">{label}</h3>
          {g.map((c) => (
            <div key={c.kind + c.personId} className={`so-cel-row ${c.days === 0 && c.kind !== "new" ? "today" : ""}`}>
              <span className="so-cel-ic" aria-hidden="true">{c.kind === "birthday" ? "🎂" : c.kind === "anniversary" ? "🎉" : "👋"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{c.name}</b>
                <span className="so-meta" style={{ display: "block" }}>{[c.kind === "birthday" ? t.bday : c.kind === "anniversary" ? t.anniv(c.years ?? 1) : c.days <= 0 ? t.started : t.starts, c.days === 0 ? null : c.when, c.team].filter(Boolean).join(" · ")}</span>
              </div>
              <button className="so-cel-btn" onClick={() => onShout(c)}>{lang === "es" ? "Felicitar" : c.kind === "new" ? "Welcome" : "Celebrate"}</button>
            </div>
          ))}
        </section>
      ))}
      <p className="so-meta so-fine">{t.optNote}</p>
    </div>
  );
}
