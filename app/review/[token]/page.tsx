"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Cand = {
  id: string;
  name: string;
  headline: string;
  summary: string;
  strengths: string[];
  assessment: string;
  kind: "video" | "audio" | "written" | null;
  seconds: number | null;
  hasMedia: boolean;
  hasResume: boolean;
  linkedin: string | null;
  at: string;
  mine: { decision: "yes" | "no"; note: string } | null;
};
type Info = {
  company: string;
  accent: string;
  logo: string | null;
  reviewer: string;
  expiresAt: string | null;
  role: { title: string; location?: string; type?: string; dept?: string; criteria: string[] };
  candidates: Cand[];
};

const DEMO: Info = {
  company: "Blueprint Studios",
  accent: "#2b3cf5",
  logo: null,
  reviewer: "Pat Morgan",
  expiresAt: null,
  role: { title: "Warehouse Coordinator", location: "San Francisco", type: "Full-time", criteria: ["Inventory accuracy", "Calm under deadline", "Forklift certified"] },
  candidates: [
    { id: "d1", name: "Riley Chen", headline: "Video pitch, 84s", summary: "", strengths: [], assessment: "Clear, organized, ran inventory for a 40k sq ft space.", kind: "video", seconds: 84, hasMedia: true, hasResume: true, linkedin: null, at: "2026-11-03T18:00:00Z", mine: null },
    { id: "d2", name: "Jordan Alvarez", headline: "Video pitch, 71s", summary: "", strengths: [], assessment: "", kind: "video", seconds: 71, hasMedia: true, hasResume: false, linkedin: "https://www.linkedin.com/", at: "2026-11-04T16:00:00Z", mine: { decision: "yes", note: "Strong energy." } },
    { id: "d3", name: "Sam Okoro", headline: "Audio pitch", summary: "", strengths: [], assessment: "", kind: "audio", seconds: 62, hasMedia: true, hasResume: true, linkedin: null, at: "2026-11-05T20:00:00Z", mine: null },
  ],
};

const fmtSec = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
const day = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The page an outside reviewer opens from Ben's link: watch each pitch, say yes or no. */
export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">("loading");
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch(`/api/review/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setInfo(j);
          setState("ok");
        } else if (j.reason === "demo") {
          setInfo(DEMO);
          setDemo(true);
          setState("ok");
        } else setState("gone");
      })
      .catch(() => setState("error"));
  }, [token]);

  const call = async (body: object) => {
    if (demo) return { ok: body && (body as { action: string }).action === "review", reason: "demo" };
    const r = await fetch(`/api/review/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json().catch(() => ({ ok: false }));
  };

  if (state === "loading") return <div className="rv-wrap"><p className="rv-muted" style={{ textAlign: "center", marginTop: 80 }}>Loading…</p></div>;
  if (state !== "ok" || !info)
    return (
      <div className="rv-wrap">
        <div className="rv-card" style={{ marginTop: 60 }}>
          <h1 className="rv-h1">{state === "gone" ? "This link isn't active" : "Couldn't load this page"}</h1>
          <p className="rv-muted">{state === "gone" ? "It may have expired or been turned off. Ask the person who sent it for a new one." : "Check your connection and refresh."}</p>
        </div>
      </div>
    );

  const done = info.candidates.filter((c) => c.mine).length;
  const setMine = (id: string, mine: Cand["mine"]) => setInfo({ ...info, candidates: info.candidates.map((c) => (c.id === id ? { ...c, mine } : c)) });

  return (
    <div className="rv-wrap" style={{ ["--accent" as string]: info.accent }}>
      <header className="rv-head">
        {info.logo ? <img src={info.logo} alt={info.company} className="rv-logo" /> : <b className="rv-co">{info.company}</b>}
        <span className="rv-muted rv-small">Candidate review</span>
      </header>
      <h1 className="rv-h1">{info.role.title}</h1>
      <p className="rv-muted" style={{ margin: "4px 0 0" }}>{[info.role.dept, info.role.location, info.role.type].filter(Boolean).join(" · ")}</p>
      <div className="rv-intro">
        <p style={{ margin: 0 }}>Hi {info.reviewer.split(" ")[0]}. Watch each pitch and tap <b>Yes</b> or <b>No</b>. You can change your mind any time{info.expiresAt ? ` until ${day(info.expiresAt)}` : ""}.</p>
        {info.role.criteria.length > 0 && <p className="rv-small" style={{ margin: "8px 0 0" }}><b>Looking for:</b> {info.role.criteria.join(" · ")}</p>}
        <div className="rv-prog" aria-label={`${done} of ${info.candidates.length} reviewed`}>
          <div className="rv-bar"><i style={{ width: `${info.candidates.length ? (done / info.candidates.length) * 100 : 0}%` }} /></div>
          <span className="rv-small">{done} of {info.candidates.length} reviewed</span>
        </div>
      </div>
      {demo && <p className="rv-demo rv-small">Demo preview. In the live portal, videos play here.</p>}

      {info.candidates.length === 0 ? (
        <div className="rv-card rv-muted">No candidates to review yet. Check back soon.</div>
      ) : (
        info.candidates.map((c, i) => <CandidateCard key={c.id} c={c} n={i + 1} call={call} demo={demo} onSaved={(m) => setMine(c.id, m)} />)
      )}
      <p className="rv-foot rv-small rv-muted">Private link for {info.reviewer}. Please don&apos;t forward it. Videos are for this hiring decision only.</p>
    </div>
  );
}

function CandidateCard({ c, n, call, demo, onSaved }: { c: Cand; n: number; call: (b: object) => Promise<{ ok?: boolean; url?: string; reason?: string }>; demo: boolean; onSaved: (m: Cand["mine"]) => void }) {
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState(c.mine?.note ?? "");
  const [showNote, setShowNote] = useState(!!c.mine?.note);
  const [saved, setSaved] = useState("");

  const play = async () => {
    if (demo) return setErr("Demo preview: videos play in the live portal.");
    setBusy(true);
    setErr("");
    const j = await call({ action: "media", c: c.id, f: "media" });
    setBusy(false);
    if (j.ok && j.url) setSrc(j.url);
    else setErr("Couldn't load the video. Refresh and try again.");
  };
  const resume = async () => {
    if (demo) return setErr("Demo preview: resumes open in the live portal.");
    const w = window.open("", "_blank");
    const j = await call({ action: "media", c: c.id, f: "resume" });
    if (j.ok && j.url && w) w.location.href = j.url;
    else {
      w?.close();
      setErr("Couldn't open the resume.");
    }
  };
  const decide = async (decision: "yes" | "no", withNote = note) => {
    setErr("");
    const prev = c.mine;
    onSaved({ decision, note: withNote });
    const j = await call({ action: "review", c: c.id, decision, note: withNote });
    if (!j.ok && j.reason !== "demo") {
      onSaved(prev);
      return setErr("That didn't save. Try again.");
    }
    setSaved(decision === "yes" ? "Saved: Yes" : "Saved: No");
    setTimeout(() => setSaved(""), 2000);
  };

  return (
    <article className={`rv-card rv-cand ${c.mine ? `is-${c.mine.decision}` : ""}`}>
      <div className="rv-row">
        <span className="rv-num">{n}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="rv-name">{c.name}</h2>
          <span className="rv-small rv-muted">{c.kind === "audio" ? "Audio pitch" : c.kind === "video" ? "Video pitch" : c.headline}{c.seconds ? `, ${fmtSec(c.seconds)}` : ""} · {day(c.at)}</span>
        </div>
        {c.mine && <span className={`rv-tag ${c.mine.decision}`}>{c.mine.decision === "yes" ? "✓ Yes" : "✕ No"}</span>}
      </div>

      {c.hasMedia &&
        (src ? (
          c.kind === "audio" ? <audio className="rv-media" src={src} controls autoPlay /> : <video className="rv-media" src={src} controls autoPlay playsInline />
        ) : (
          <button className="rv-play" onClick={play} disabled={busy}>
            <span aria-hidden="true">▶</span> {busy ? "Loading…" : `Play ${c.kind === "audio" ? "audio" : "video"}`}
          </button>
        ))}
      {!c.hasMedia && c.kind && <p className="rv-small rv-muted">The recording has been removed.</p>}

      {c.assessment && <p className="rv-assess rv-small"><b>Alza notes:</b> {c.assessment}</p>}
      {c.summary && <p className="rv-small" style={{ margin: "8px 0 0" }}>{c.summary}</p>}
      {c.strengths.length > 0 && <p className="rv-small rv-muted" style={{ margin: "6px 0 0" }}>{c.strengths.join(" · ")}</p>}
      {(c.hasResume || c.linkedin) && (
        <div className="rv-links rv-small">
          {c.hasResume && <button className="rv-link" onClick={resume}>Resume</button>}
          {c.linkedin && <a className="rv-link" href={c.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
        </div>
      )}

      <div className="rv-yn">
        <button className={`rv-btn no ${c.mine?.decision === "no" ? "on" : ""}`} aria-pressed={c.mine?.decision === "no"} onClick={() => decide("no")}>No</button>
        <button className={`rv-btn yes ${c.mine?.decision === "yes" ? "on" : ""}`} aria-pressed={c.mine?.decision === "yes"} onClick={() => decide("yes")}>Yes</button>
      </div>
      {showNote ? (
        <div className="rv-note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Why? (optional, goes to Ben)" rows={2} />
          {c.mine && note !== (c.mine.note ?? "") && <button className="rv-link" onClick={() => decide(c.mine!.decision, note)}>Save note</button>}
        </div>
      ) : (
        <button className="rv-link rv-small" onClick={() => setShowNote(true)}>Add a note</button>
      )}
      {saved && <p className="rv-small rv-ok">{saved}</p>}
      {err && <p className="rv-small rv-err">{err}</p>}
    </article>
  );
}
