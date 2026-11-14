"use client";

// This or That card: tap one, then see how the team picked. Works on every wall style and on the QR page.
import { useState } from "react";
import { LIBRARY, pct, PollView, roundEnds, roundOf } from "@/lib/polls";

const endsLabel = (d: string) => new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

export function PollCard({ poll, onVote, look = "clean" }: { poll: PollView; onVote: (c: "a" | "b") => Promise<PollView | null | void>; look?: string }) {
  const [p, setP] = useState(poll);
  const [busy, setBusy] = useState(false);
  const total = p.votes.a + p.votes.b;
  const vote = async (c: "a" | "b") => {
    if (p.mine || busy) return;
    setBusy(true);
    setP({ ...p, mine: c, votes: { ...p.votes, [c]: p.votes[c] + 1 } }); // show it right away
    const next = await onVote(c);
    if (next) setP(next);
    setBusy(false);
  };
  return (
    <article className={`wn poll poll-${look}`} aria-label="This or That">
      <div className="poll-kick">{look === "graffiti" ? <><b>THIS OR THAT</b><span>VOTE</span></> : "THIS OR THAT"}</div>
      <div className="poll-body">
        <h3 className="poll-q">{p.q}</h3>
        {!p.mine ? (
          <>
            <div className="poll-btns">
              <button className="poll-a" onClick={() => vote("a")} disabled={busy}>{p.a}</button>
              <button className="poll-b" onClick={() => vote("b")} disabled={busy}>{p.b}</button>
            </div>
            <p className="poll-note">Tap to vote and see how the team picked.</p>
          </>
        ) : (
          <>
            {(["a", "b"] as const).map((k) => (
              <div key={k} className={`poll-row ${k}`}>
                <div className="poll-row-top"><span>{p[k]}{p.mine === k ? " ✓" : ""}</span><span>{pct(p.votes[k], total)}%</span></div>
                <div className="poll-bar"><span style={{ width: `${pct(p.votes[k], total)}%` }} /></div>
              </div>
            ))}
            <p className="poll-note">{total} {total === 1 ? "vote" : "votes"} · a new one after {endsLabel(p.ends)}</p>
          </>
        )}
        {p.last && (
          <p className="poll-last">
            Last time: <b>{p.last.pa >= p.last.pb ? p.last.a : p.last.b}</b> beat {p.last.pa >= p.last.pb ? p.last.b : p.last.a}, {Math.max(p.last.pa, p.last.pb)} to {Math.min(p.last.pa, p.last.pb)}
          </p>
        )}
      </div>
    </article>
  );
}

/** The demo: a real library question for this round, made-up counts, your vote kept on this device. */
export function demoPoll(): PollView {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const round = roundOf(today);
  const month = d.getMonth() + 1;
  const pool = LIBRARY.filter((q) => q.months?.includes(month));
  const q = (pool.length ? pool : LIBRARY)[Math.abs(round) % (pool.length || LIBRARY.length)];
  let mine: "a" | "b" | undefined;
  try {
    mine = (localStorage.getItem(`alza-demo-poll-${round}`) as "a" | "b" | null) ?? undefined;
  } catch {}
  const votes = { a: 31 + (mine === "a" ? 1 : 0), b: 17 + (mine === "b" ? 1 : 0) };
  return { id: `demo-${round}`, q: q.q, a: q.a, b: q.b, votes, mine, ends: roundEnds(round), last: { q: "Vacation?", a: "Beach", b: "Mountains", pa: 61, pb: 39 } };
}
export function demoVote(c: "a" | "b") {
  try {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    localStorage.setItem(`alza-demo-poll-${roundOf(today)}`, c);
  } catch {}
}
