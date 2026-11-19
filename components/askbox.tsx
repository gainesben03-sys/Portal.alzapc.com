"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";

const CHIPS: { q: string; mode: "handbook" | "situation" }[] = [
  { q: "How much sick time do people get?", mode: "handbook" },
  { q: "Someone keeps showing up late", mode: "situation" },
  { q: "Do I have to approve overtime ahead of time?", mode: "handbook" },
];

const SITUATION = /\b(employee|someone|he|she|they|team|crew|keeps|won't|refus|late|attitude|rude|conflict|argu|complain|upset|defensive|feedback|performance|conversation|warning|coach)\b/i;

/** A plain-language question box. Questions go to Ask HR, which answers from the handbook or coaches a situation. */
export function AskBox({ clientId, compact, slim, tile }: { clientId: string; compact?: boolean; slim?: boolean; tile?: boolean }) {
  const router = useRouter();
  const { config, me, viewer } = useStore();
  const [q, setQ] = useState("");
  if (config[clientId]?.askHr === false) return null;
  if (viewer?.kind === "client" && me?.access === "hiring") return null;
  const go = (text: string, mode?: "handbook" | "situation") => {
    const t = text.trim();
    if (!t) return;
    const m = mode ?? (SITUATION.test(t) ? "situation" : "handbook");
    router.push(`/c/${clientId}/hub/ask?mode=${m}&q=${encodeURIComponent(t.slice(0, 2000))}`);
  };
  if (tile) {
    const exec = viewer?.kind === "advisor" || me?.access === "exec";
    return (
      <div className="askbox-tile">
        <form className="askbox-row" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <input className="f" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about a policy or a situation" maxLength={2000} enterKeyHint="send" aria-label="Ask HR a question" />
          <button className="btn primary" type="submit" disabled={!q.trim()}>Ask</button>
        </form>
        <div className="askbox-chips">
          {CHIPS.map((c) => <button key={c.q} type="button" className="chip chip-btn" onClick={() => go(c.q, c.mode)}>{c.q}</button>)}
        </div>
        {exec && (
          <Link href={`/c/${clientId}/hub/ask/document`} className="askbox-doc">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
            <span className="grow"><b className="small">Document an issue</b><span className="tiny muted" style={{ display: "block" }}>A write-up, email recap or file note, from your handbook</span></span>
            <span aria-hidden="true">›</span>
          </Link>
        )}
      </div>
    );
  }
  if (slim)
    return (
      <form className="askbox-slim" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <label htmlFor={`askbox-${clientId}`} className="askbox-tag">Ask HR</label>
        <input id={`askbox-${clientId}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="The handbook, or a tricky situation" maxLength={2000} enterKeyHint="send" />
        <button className="btn primary sm" type="submit" disabled={!q.trim()}>Ask</button>
      </form>
    );
  return (
    <form className={`card askbox ${compact ? "compact" : ""}`} onSubmit={(e) => { e.preventDefault(); go(q); }}>
      <label className="askbox-label" htmlFor={`askbox-${clientId}`}>
        <b>Ask HR</b>
        <span className="tiny muted"> · the handbook, or a sticky situation</span>
      </label>
      <div className="askbox-row">
        <input id={`askbox-${clientId}`} className="f" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" maxLength={2000} enterKeyHint="send" />
        <button className="btn primary" type="submit" disabled={!q.trim()}>Ask</button>
      </div>
      {!compact && (
        <div className="askbox-chips">
          {CHIPS.map((c) => <button key={c.q} type="button" className="chip chip-btn" onClick={() => go(c.q, c.mode)}>{c.q}</button>)}
        </div>
      )}
    </form>
  );
}
