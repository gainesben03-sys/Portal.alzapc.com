"use client";

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
export function AskBox({ clientId, compact }: { clientId: string; compact?: boolean }) {
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
