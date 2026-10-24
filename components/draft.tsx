"use client";

import { useState } from "react";
import { authHeader } from "@/lib/supabase";

export type DraftMode = "reply" | "document";

const REASONS: Record<string, string> = {
  no_key: "Drafting is off. Add ANTHROPIC_API_KEY in Vercel and redeploy to turn it on.",
  demo: "Drafting works once the portal is connected to Supabase.",
  forbidden: "Only Ben can draft with Claude.",
  api_401: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.",
  api_400: "Claude couldn't take that request. Try shorter instructions.",
  api_429: "Claude is rate limited right now. Try again in a minute.",
  api_529: "Claude is busy right now. Try again in a minute.",
};

async function requestDraft(body: Record<string, unknown>): Promise<{ draft: string; forBen: string } | { error: string }> {
  try {
    const r = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.ok) return { draft: j.draft, forBen: j.forBen };
    if (/credit|balance/i.test(j.detail ?? "")) return { error: "Your Anthropic account is out of credit. Add credit at console.anthropic.com." };
    return { error: REASONS[j.reason] ?? `Drafting failed (${j.reason ?? r.status}). Try again.` };
  } catch {
    return { error: "Couldn't reach Claude. Check your connection and try again." };
  }
}

/** Download text as a Word-openable document. */
export function wordBlob(title: string, text: string): Blob {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = esc(text)
    .split(/\n{2,}/)
    .map((p) => {
      const t = p.trim();
      if (/^#{1,3}\s/.test(t)) return `<h2>${t.replace(/^#{1,3}\s/, "")}</h2>`;
      if (/^(\*|-)\s/m.test(t)) return `<ul>${t.split("\n").map((l) => `<li>${l.replace(/^(\*|-)\s/, "")}</li>`).join("")}</ul>`;
      return `<p>${t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  const html = `<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h2{font-size:13pt;margin:14pt 0 4pt}</style></head><body>${body}</body></html>`;
  return new Blob(["﻿", html], { type: "application/msword" });
}

export function downloadWord(title: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(wordBlob(title, text));
  a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "Draft"}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const TWEAKS = ["Shorter", "Warmer", "More formal", "Simpler words"];

/**
 * Claude drafts, Ben edits and approves. Nothing is sent or shared until Ben taps the primary button.
 */
export function DraftPanel({
  clientId,
  mode,
  noteId,
  actionId,
  title,
  askForInstructions,
  primaryLabel,
  onUse,
  onClose,
}: {
  clientId: string;
  mode: DraftMode;
  noteId?: string;
  actionId?: string;
  title: string;
  askForInstructions?: boolean;
  primaryLabel: string;
  onUse: (text: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [forBen, setForBen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tweak, setTweak] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async (extra?: string) => {
    setBusy(true);
    setErr("");
    const res = await requestDraft({
      clientId,
      mode,
      noteId,
      actionId,
      instructions: [instructions, extra].filter(Boolean).join("\n") || undefined,
      previous: extra ? draft ?? undefined : undefined,
    });
    setBusy(false);
    if ("error" in res) return setErr(res.error);
    setDraft(res.draft);
    setForBen(res.forBen);
    setTweak("");
  };

  return (
    <div className="draft-panel">
      <div className="row" style={{ alignItems: "center" }}>
        <b className="small">
          <span className="spark" aria-hidden="true">✦</span> {draft ? "Claude's draft. Edit anything before it goes out." : title}
        </b>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>

      {!draft && (
        <>
          {askForInstructions && (
            <textarea
              className="f"
              style={{ marginTop: 8 }}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What should Claude write? e.g. A one-page PTO policy for 25 employees in California, accrual not unlimited, 15 days a year."
            />
          )}
          <button className="btn primary block" style={{ marginTop: 10 }} disabled={busy || (askForInstructions && !instructions.trim())} onClick={() => run()}>
            {busy ? "Drafting..." : "Draft it"}
          </button>
        </>
      )}

      {busy && draft && <p className="tiny muted" style={{ marginTop: 8 }}>Rewriting...</p>}
      {err && <p className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</p>}

      {draft !== null && (
        <>
          <textarea className="f draft-text" value={draft} onChange={(e) => setDraft(e.target.value)} />
          {forBen && (
            <div className="for-ben">
              <b>Only you see this</b>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{forBen}</div>
            </div>
          )}
          <div className="chips" style={{ marginTop: 10 }}>
            {TWEAKS.map((t) => (
              <button key={t} className="chip chip-btn" disabled={busy} onClick={() => run(t)}>{t}</button>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (tweak.trim()) run(tweak.trim());
            }}
          >
            <input className="f" value={tweak} onChange={(e) => setTweak(e.target.value)} placeholder="Or tell Claude what to change" />
            <button className="btn" disabled={busy || !tweak.trim()}>Redo</button>
          </form>
          <div className="action-foot" style={{ justifyContent: "flex-end" }}>
            <button
              className="btn ghost sm"
              onClick={() => {
                navigator.clipboard?.writeText(draft).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            {mode === "document" && <button className="btn ghost sm" onClick={() => downloadWord(title, draft)}>Download for Word</button>}
            <button className="btn primary sm" disabled={busy || !draft.trim()} onClick={() => onUse(draft.trim())}>{primaryLabel}</button>
          </div>
        </>
      )}
    </div>
  );
}
