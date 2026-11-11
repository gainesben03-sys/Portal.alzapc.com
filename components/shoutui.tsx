"use client";

// Pieces shared by the QR page, the TV display and the portal: the wall card, the scoreboard,
// and the person search.
import { useEffect, useRef, useState } from "react";
import { ago, Board, REACTIONS } from "@/lib/recognition";
import type { PublicChallenge } from "@/lib/challenges";

export type WallItem = { id: string; to: string; team: string; from: string; value: string | null; message: string; at: string; reactions: Record<string, number>; mine: string[]; status?: string; heldReason?: string };
export type Pick = { id: string; name: string; team: string };

export function ShoutCard({ s, onReact, onReport, onRemove, big, highlight }: { s: WallItem; onReact?: (emoji: string) => void; onReport?: () => void; onRemove?: () => void; big?: boolean; highlight?: boolean }) {
  const [menu, setMenu] = useState(false);
  return (
    <article className={`so-card ${big ? "big" : ""} ${highlight ? "hl" : ""}`} id={`s-${s.id}`}>
      <div className="so-top">
        <span className="so-av" aria-hidden="true">{s.to.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b className="so-to">{s.to}</b>
          <span className="so-meta">{[s.team, `from ${s.from}`, ago(s.at)].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <p className="so-msg">{s.message}</p>
      {(onReact || onReport || onRemove) && (
        <div className="so-foot">
          {REACTIONS.map((e) => (
            <button key={e} className={`so-rx ${s.mine.includes(e) ? "on" : ""}`} onClick={() => onReact?.(e)} disabled={!onReact} aria-pressed={s.mine.includes(e)} aria-label={`React ${e}`}>
              {e}
              {s.reactions[e] ? <span>{s.reactions[e]}</span> : null}
            </button>
          ))}
          {(onReport || onRemove) && (
            <span className="so-more">
              <button className="so-dots" aria-label="More" onClick={() => setMenu(!menu)}>···</button>
              {menu && (
                <span className="so-menu">
                  {onReport && <button onClick={() => { setMenu(false); onReport(); }}>Report this</button>}
                  {onRemove && <button onClick={() => { setMenu(false); onRemove(); }}>Take it down</button>}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

export function Scoreboard({ b, big }: { b: Board; big?: boolean }) {
  const max = Math.max(1, ...b.byValue.map((v) => v.n));
  const tmax = Math.max(1, ...b.byTeam.map((v) => v.n));
  return (
    <div className={`so-board ${big ? "big" : ""}`}>
      <div className="so-kpis">
        <div><b>{b.total}</b><span>shoutouts this month</span></div>
        <div><b>{b.people}</b><span>people recognized</span></div>
        <div><b>{b.streakWeeks}</b><span>{b.streakWeeks === 1 ? "week" : "weeks"} in a row</span></div>
      </div>
      {b.byTeam.length > 0 && (
        <div className="so-sec">
          <h3>Teams</h3>
          {b.byTeam.map((v) => (
            <div className="so-bar" key={v.team}>
              <span>{v.team}</span>
              <i><em style={{ width: `${(v.n / tmax) * 100}%` }} /></i>
              <b>{v.n}</b>
            </div>
          ))}
        </div>
      )}
      {b.topGivers.length > 0 && (
        <div className="so-sec">
          <h3>Most generous 💛</h3>
          <div className="so-givers">{b.topGivers.map((g, i) => <span key={g.name}>{i === 0 ? "🥇 " : ""}{g.name} <b>{g.n}</b></span>)}</div>
        </div>
      )}
    </div>
  );
}

/** Type a name, pick from the roster. */
export function PersonSearch({ search, value, onPick, placeholder, exclude, autoFocus }: { search: (q: string) => Promise<Pick[]>; value: Pick | null; onPick: (p: Pick | null) => void; placeholder: string; exclude?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Pick[]>([]);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) return setHits([]);
    t.current = setTimeout(() => search(q).then((h) => setHits(h.filter((x) => x.id !== exclude))), 220);
  }, [q, search, exclude]);
  if (value)
    return (
      <div className="so-picked">
        <span className="so-av sm" aria-hidden="true">{value.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
        <b>{value.name}</b>
        {value.team && <span className="so-meta">{value.team}</span>}
        <button className="so-link" onClick={() => { onPick(null); setQ(""); }}>Change</button>
      </div>
    );
  return (
    <div className="so-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" />
      {hits.length > 0 && (
        <div className="so-hits">
          {hits.map((h) => (
            <button key={h.id} onClick={() => { onPick(h); setHits([]); }}>
              <b>{h.name}</b>
              {h.team && <span>{h.team}</span>}
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="so-meta" style={{ margin: "6px 2px 0" }}>No match yet. Try their first name.</p>}
    </div>
  );
}

// ---------- challenges ----------

/** Live challenges as cards: the chain's length and streak, a goal's progress bar, the Welcome Wagon. */
export function ChallengeCards({ list, lang = "en", big }: { list: PublicChallenge[]; lang?: "en" | "es"; big?: boolean }) {
  if (!list.length) return null;
  const es = lang === "es";
  return (
    <div className={`so-ch-list ${big ? "big" : ""}`}>
      {list.map((c) =>
        c.kind === "chain" && c.chain ? (
          <div key={c.id} className="so-ch chain">
            <span className="so-ch-ic" aria-hidden="true">🔗</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{c.title}</b>
              <div className="so-ch-stats">
                <span><em>{c.chain.links}</em>{es ? " eslabones" : c.chain.links === 1 ? " link" : " links"}</span>
                <span><em>{c.chain.longest}</em>{es ? " racha más larga" : " longest streak"}</span>
                {c.chain.teams > 1 && <span><em>{c.chain.teams}</em>{es ? " equipos" : " teams"}</span>}
                {c.chain.open > 0 && <span><em>{c.chain.open}</em>{es ? " pasándolo ahora" : " passing it on now"}</span>}
              </div>
              <div className="so-chainviz" aria-hidden="true">{Array.from({ length: Math.min(c.chain.links, 24) }, (_, i) => <i key={i} />)}{c.chain.links > 24 && <span>+{c.chain.links - 24}</span>}</div>
            </div>
          </div>
        ) : c.kind === "goal" && c.goal ? (
          <div key={c.id} className={`so-ch goal ${c.goal.reached ? "done" : ""}`}>
            <span className="so-ch-ic" aria-hidden="true">{c.goal.reached ? "🏆" : "🎯"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{c.title}</b>
              <div className="so-goalbar"><i style={{ width: `${c.goal.pct}%` }} /></div>
              <div className="so-ch-stats">
                <span><em>{c.goal.count}</em> / {c.goal.target}{c.goal.value ? ` · ${c.goal.value}` : ""}</span>
                {c.goal.reached ? <span>🎉 {es ? "¡Meta lograda!" : "Goal reached!"}</span> : c.goal.daysLeft != null && <span>{c.goal.daysLeft} {es ? "días" : c.goal.daysLeft === 1 ? "day left" : "days left"}</span>}
                {c.goal.reward && <span>🎁 {c.goal.reward}</span>}
              </div>
            </div>
          </div>
        ) : c.kind === "welcome" && c.welcome && c.welcome.length > 0 ? (
          <div key={c.id} className="so-ch welcome">
            <span className="so-ch-ic" aria-hidden="true">👋</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{c.title}</b>
              <div className="so-wagon">
                {c.welcome.slice(0, big ? 4 : 6).map((n) => (
                  <span key={n.personId} className={n.got >= n.target ? "full" : ""}>
                    {n.name} <em>{Math.min(n.got, n.target)}/{n.target}</em>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

/** A short burst of confetti in the brand colors (skipped for people who prefer less motion). */
export function Burst() {
  const bits = useRef(
    Array.from({ length: 36 }, (_, i) => ({
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 300),
      dur: 900 + Math.round(Math.random() * 900),
      rot: Math.round(Math.random() * 360),
      c: i % 4,
      w: 6 + Math.round(Math.random() * 6),
    }))
  ).current;
  return (
    <div className="so-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} className={`c${b.c}`} style={{ left: `${b.left}%`, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, transform: `rotate(${b.rot}deg)`, width: b.w, height: b.w * 0.45 }} />
      ))}
    </div>
  );
}
