"use client";

// The page behind the QR code. No login: give a shoutout in about 20 seconds, see the wall, react.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Pick, PersonSearch, Scoreboard, ShoutCard, WallItem } from "@/components/shoutui";
import { Board, MAX_MESSAGE, shortName, STARTERS } from "@/lib/recognition";
import { DEMO_PEOPLE, DEMO_SHOUTS, DEMO_VALUES, demoBoard, demoReactions } from "@/lib/shoutdemo";

type Info = { company: string; accent: string; logo: string | null; values: string[]; sms: string | null; showWall: boolean; board: Board | null; wall: WallItem[] };
type Lang = "en" | "es";

const W = {
  en: { give: "Give a shoutout", wall: "Wall", who: "Who are you recognizing?", whoPh: "Start typing their name", what: "What did they do?", whatPh: "Be specific. What happened, and why it mattered.", value: "Which value does it show?", skip: "Skip", from: "Who's it from?", fromPh: "Find your name", notListed: "I'm not on the list", yourName: "Your name", send: "Send shoutout", sending: "Sending…", sentT: "Sent! 🎉", sentB: (n: string) => `${n} will get it right away.`, heldB: "Thanks! It'll post after a quick check.", another: "Recognize someone else", seeWall: "See the wall", text: (n: string) => `Or text a name to ${n}`, empty: "No shoutouts yet. Be the first.", private: "Shoutouts are checked before they post. Keep it about the work.", report: "Thanks. We'll take a look.", limit: "That's the limit for today. Thank you for recognizing so many people!", err: "That didn't send. Try again." },
  es: { give: "Dar un reconocimiento", wall: "Muro", who: "¿A quién quieres reconocer?", whoPh: "Escribe su nombre", what: "¿Qué hizo?", whatPh: "Sé específico. Qué pasó y por qué importó.", value: "¿Qué valor muestra?", skip: "Omitir", from: "¿De parte de quién?", fromPh: "Busca tu nombre", notListed: "No estoy en la lista", yourName: "Tu nombre", send: "Enviar", sending: "Enviando…", sentT: "¡Enviado! 🎉", sentB: (n: string) => `${n} lo recibirá enseguida.`, heldB: "¡Gracias! Se publicará después de una revisión rápida.", another: "Reconocer a alguien más", seeWall: "Ver el muro", text: (n: string) => `O manda un mensaje con un nombre al ${n}`, empty: "Aún no hay reconocimientos. Sé el primero.", private: "Los reconocimientos se revisan antes de publicarse. Habla del trabajo.", report: "Gracias. Lo revisaremos.", limit: "Llegaste al límite de hoy. ¡Gracias por reconocer a tantas personas!", err: "No se envió. Intenta de nuevo." },
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
  const [tab, setTab] = useState<"give" | "wall">("give");
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
    const r = await fetch(`/api/shout/${encodeURIComponent(token)}?d=${deviceId()}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (r.ok) {
      setInfo(r);
      setState("ok");
    } else if (r.reason === "demo") {
      setDemo(true);
      setInfo({
        company: "Blueprint Studios",
        accent: "#2b3cf5",
        logo: null,
        values: DEMO_VALUES,
        sms: "+14155550123",
        showWall: true,
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

  const send = async () => {
    if (!to || msg.trim().length < 3 || (!from && !typed?.trim())) return;
    setBusy(true);
    const r = await post({ action: "give", to: to.id, fromId: from?.id, fromName: from ? undefined : typed, value, message: msg, lang });
    setBusy(false);
    if (!r.ok) return flash(r.reason === "limit" ? t.limit : r.reason === "self" ? "😄" : t.err);
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
    <div className="so-page" style={{ ["--accent" as string]: info.accent }}>
      <header className="so-head">
        {info.logo ? <img src={info.logo} alt={info.company} className="so-logo" /> : <b>{info.company}</b>}
        <div className="so-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setL("en")}>EN</button>
          <button className={lang === "es" ? "on" : ""} onClick={() => setL("es")}>ES</button>
        </div>
      </header>
      <div className="so-hero">
        <span className="so-kicker">{lang === "es" ? "Reconocimientos" : "Shoutouts"}</span>
        <h1 className="so-h1">{lang === "es" ? "¿Quién te alegró el día?" : "Who made your day better?"}</h1>
      </div>
      {demo && <p className="so-demo">Demo preview with sample people.</p>}
      {info.showWall && (
        <div className="so-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "give"} className={tab === "give" ? "on" : ""} onClick={() => setTab("give")}>{t.give}</button>
          <button role="tab" aria-selected={tab === "wall"} className={tab === "wall" ? "on" : ""} onClick={() => setTab("wall")}>{t.wall}{info.board ? ` · ${info.board.total}` : ""}</button>
        </div>
      )}

      {tab === "give" ? (
        done ? (
          <div className="so-panel so-done">
            <div className="so-burst" aria-hidden="true">🎉</div>
            <h2>{t.sentT}</h2>
            <p>{done === "live" ? t.sentB(to?.name.split(" ")[0] ?? "") : t.heldB}</p>
            <button className="so-btn" onClick={reset}>{t.another}</button>
            {info.showWall && <button className="so-link" onClick={() => { reset(); setTab("wall"); }}>{t.seeWall}</button>}
          </div>
        ) : (
          <div className="so-panel">
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
            {typed === null ? (
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

            <button className="so-btn" disabled={busy || !to || msg.trim().length < 3 || (!from && !typed?.trim())} onClick={send}>{busy ? t.sending : t.send}</button>
            <p className="so-meta so-fine">{t.private}</p>
            {info.sms && <p className="so-meta so-fine">📱 {t.text(info.sms.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3"))}</p>}
          </div>
        )
      ) : (
        <>
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
