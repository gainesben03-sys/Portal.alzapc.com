"use client";

import Link from "next/link";
import { useState } from "react";
import { Resource } from "@/lib/modules";
import { authHeader } from "@/lib/supabase";
import { Lang, Practice, PracticeContent, Scenario } from "@/lib/practice";
import { Sheet } from "./ui";

const WHY: Record<string, string> = {
  no_text: "Couldn't read the training. Paste the slide text or notes below and try again.",
  no_key: "The Claude key isn't set in Vercel yet.",
  bad_answer: "Claude's answer didn't come through cleanly. Try again.",
  forbidden: "Only you can do this.",
};

/** Ben builds, reviews and publishes practice for a training. Managers see it only once it's published. */
export function PracticeSheet({ r, onSave, onClose }: { r: Resource; onSave: (p: Practice | undefined, msg: string) => void; onClose: () => void }) {
  const [p, setP] = useState<Practice | undefined>(r.practice);
  const [lang, setLang] = useState<Lang>("en");
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [spanish, setSpanish] = useState(/bilingual|español|spanish/i.test(`${r.title} ${r.desc} ${r.fileName ?? ""}`));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rebuild, setRebuild] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);

  const build = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/practice/generate", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ id: r.id, notes: notes.trim() || undefined, text: text.trim() || undefined, spanish }) });
      const j = await res.json();
      if (!j.ok) setErr(WHY[j.reason] ?? `Couldn't build it (${j.reason ?? "error"}${j.detail ? `: ${String(j.detail).slice(0, 200)}` : ""}).`);
      else {
        setP({ status: "draft", langs: j.langs, content: j.content, at: new Date().toISOString(), notes: j.notes });
        setRebuild(false);
        setLang("en");
      }
    } catch {
      setErr("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  };

  // edits apply to every language at the same position, so EN and ES stay lined up
  const each = (f: (c: PracticeContent) => PracticeContent) => p && setP({ ...p, content: Object.fromEntries(Object.entries(p.content).map(([k, c]) => [k, c ? f(c) : c])) });
  const one = (f: (c: PracticeContent) => PracticeContent) => p && setP({ ...p, content: { ...p.content, [lang]: f(p.content[lang]!) } });
  const setScen = (i: number, patch: Partial<Scenario>) => one((c) => ({ ...c, scenarios: c.scenarios.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));

  const c = p?.content[lang] ?? p?.content.en;
  const share = r.shares[0]?.clientId;

  if (!p || rebuild)
    return (
      <Sheet title={rebuild ? "Rebuild practice" : "Make practice from this training"} onClose={onClose}>
        <p className="small" style={{ marginTop: 0 }}>Claude reads the {r.path ? "file" : "training"} and builds the key ideas, a quick check, a sorting drill, role-plays using the training&apos;s scenarios, and a planner for a real conversation. You review everything before any manager sees it.</p>
        {!r.path && (
          <label className="f">Training text <span className="tiny muted">(paste the slides or notes; links can&apos;t be read)</span>
            <textarea className="f" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {r.path && (
          <details className="tiny muted" style={{ marginTop: 6 }}>
            <summary>Or paste the text instead</summary>
            <textarea className="f" style={{ minHeight: 80, marginTop: 6 }} value={text} onChange={(e) => setText(e.target.value)} />
          </details>
        )}
        <label className="f">Notes for Claude <span className="tiny muted">(optional)</span>
          <textarea className="f" style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Crew leads on job sites, keep it practical. Add a scenario about a no-call no-show." />
        </label>
        <label className="check"><input type="checkbox" checked={spanish} onChange={(e) => setSpanish(e.target.checked)} /> Spanish version too</label>
        {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
        <div className="sheet-actions">
          <button className="btn ghost sm" onClick={rebuild ? () => setRebuild(false) : onClose}>{rebuild ? "Back" : "Cancel"}</button>
          <button className="btn primary sm" disabled={busy || (!r.path && text.trim().length < 200)} onClick={build}>{busy ? "Building, about a minute..." : "Build practice"}</button>
        </div>
      </Sheet>
    );

  return (
    <Sheet title={`Practice: ${r.title}`} onClose={onClose}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className={`pill ${p.status === "published" ? "done" : "soon"}`}>{p.status === "published" ? "Published" : "Draft"}</span>
        {p.langs.length > 1 && (
          <div className="pr-lang" style={{ marginLeft: "auto" }}>
            {p.langs.map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </div>
        )}
      </div>
      {p.notes && <p className="tiny muted" style={{ whiteSpace: "pre-wrap" }}>Claude&apos;s notes: {p.notes}</p>}

      {c && (
        <div className="pa-review">
          <b className="small">{c.title}</b> <span className="tiny muted">· {c.framework}</span>
          <p className="tiny" style={{ margin: "2px 0 8px" }}>{c.intro}</p>

          <PaHead n={c.ideas.length} label="Key ideas" />
          {c.ideas.map((k, i) => (
            <div className="pa-row" key={i}>
              <span className="grow tiny"><b>{k.label} {k.title}</b>: {k.body}{k.tryThis ? ` Try: “${k.tryThis}”` : ""}</span>
              <button className="pa-x" aria-label="Remove" onClick={() => each((x) => ({ ...x, ideas: x.ideas.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}

          <PaHead n={c.quiz.length} label="Quick check" />
          {c.quiz.map((q, i) => (
            <div className="pa-row" key={i}>
              <span className="grow tiny"><b>{q.q}</b> <span style={{ color: "var(--green)" }}>✓ {q.options[q.answer]}</span></span>
              <button className="pa-x" aria-label="Remove" onClick={() => each((x) => ({ ...x, quiz: x.quiz.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}

          {c.sort && (
            <>
              <PaHead n={c.sort.items.length} label={`Sort it: ${c.sort.prompt}`} />
              {c.sort.items.map((it, i) => (
                <div className="pa-row" key={i}>
                  <span className="grow tiny">“{it.text}” <span className="muted">→ {c.sort!.buckets[it.bucket]}</span></span>
                  <button className="pa-x" aria-label="Remove" onClick={() => each((x) => (x.sort ? { ...x, sort: { ...x.sort, items: x.sort.items.filter((_, j) => j !== i) } } : x))}>✕</button>
                </div>
              ))}
            </>
          )}

          <PaHead n={c.scenarios.length} label="Role-plays" />
          {c.scenarios.map((s, i) => (
            <div className="pa-scen" key={s.id + i}>
              <div className="pa-row" style={{ border: 0, padding: 0 }}>
                <span className="grow tiny"><b>{s.title}</b> <span className="muted">· Claude plays {s.name}</span></span>
                <button className="linklike tiny" onClick={() => setEdit(edit === `${lang}${i}` ? null : `${lang}${i}`)}>{edit === `${lang}${i}` ? "Done" : "Edit"}</button>
                <button className="pa-x" aria-label="Remove" onClick={() => each((x) => ({ ...x, scenarios: x.scenarios.filter((_, j) => j !== i) }))}>✕</button>
              </div>
              {edit === `${lang}${i}` ? (
                <>
                  <label className="f tiny">Title<input className="f" value={s.title} onChange={(e) => setScen(i, { title: e.target.value })} /></label>
                  <label className="f tiny">What the manager reads<textarea className="f" value={s.setup} onChange={(e) => setScen(i, { setup: e.target.value })} /></label>
                  <label className="f tiny">How {s.name} behaves (hidden until the end)<textarea className="f" style={{ minHeight: 90 }} value={s.persona} onChange={(e) => setScen(i, { persona: e.target.value })} /></label>
                  <label className="f tiny">What good looks like<textarea className="f" value={s.goal} onChange={(e) => setScen(i, { goal: e.target.value })} /></label>
                  <label className="f tiny">{s.name}&apos;s first line<input className="f" value={s.opener} onChange={(e) => setScen(i, { opener: e.target.value })} /></label>
                </>
              ) : (
                <p className="tiny muted" style={{ margin: "2px 0 0" }}>{s.setup}</p>
              )}
            </div>
          ))}

          <PaHead n={c.planner.length} label="Planner" />
          <p className="tiny" style={{ margin: 0 }}>{c.planner.join(" · ")}</p>
        </div>
      )}

      <div className="sheet-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn ghost sm" style={{ marginRight: "auto" }} onClick={() => { if (confirm("Remove the practice from this training?")) onSave(undefined, "Practice removed"); }}>Remove</button>
        <button className="btn ghost sm" onClick={() => setRebuild(true)}>Rebuild</button>
        {share && r.practice && <Link className="btn sm" href={`/c/${share}/hub/learn/${r.id}`}>Preview</Link>}
        {p.status === "published" ? (
          <>
            <button className="btn sm" onClick={() => onSave({ ...p, status: "draft" }, "Unpublished: managers can't see it now")}>Unpublish</button>
            <button className="btn primary sm" onClick={() => onSave(p, "Practice saved")}>Save</button>
          </>
        ) : (
          <>
            <button className="btn sm" onClick={() => onSave(p, "Draft saved. Preview it, then publish.")}>Save draft</button>
            <button className="btn primary sm" disabled={!c?.ideas.length} onClick={() => onSave({ ...p, status: "published", at: new Date().toISOString() }, r.shares.length ? "Published for managers" : "Published. Share it to a client's Trainings folder.")}>Publish</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function PaHead({ n, label }: { n: number; label: string }) {
  return <div className="pa-head tiny"><b>{label}</b><span className="muted">{n}</span></div>;
}
