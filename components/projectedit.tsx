"use client";

import { useState } from "react";
import { fmt, Project, Subtask, toISO, today } from "@/lib/data";
import { Sheet } from "./ui";

const newStepId = () => `st${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Ben edits a project: name, summary, status, target date, and its steps. */
export function EditProjectSheet({ p, onClose, onSave }: { p: Project; onClose: () => void; onSave: (next: Project, note: string) => void }) {
  const [name, setName] = useState(p.name);
  const [summary, setSummary] = useState(p.summary);
  const [status, setStatus] = useState<Project["status"]>(p.status);
  const [due, setDue] = useState(p.milestoneDue);
  const [steps, setSteps] = useState<Subtask[]>(p.steps.map((s) => ({ ...s })));
  const [adding, setAdding] = useState("");

  const setStep = (i: number, patch: Partial<Subtask>) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const n = [...steps];
    [n[i], n[j]] = [n[j], n[i]];
    setSteps(n);
  };
  const add = () => {
    const lines = adding.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return;
    setSteps([...steps, ...lines.map((text) => ({ id: newStepId(), text, done: false }))]);
    setAdding("");
  };

  const save = () => {
    const pending = adding.split("\n").map((x) => x.trim()).filter(Boolean).map((text) => ({ id: newStepId(), text, done: false }));
    const clean = [...steps, ...pending].map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
    const cur = clean.find((s) => !s.done);
    const next: Project = {
      ...p,
      name: name.trim() || p.name,
      summary: summary.trim(),
      status,
      milestoneDue: due || p.milestoneDue,
      steps: clean,
      nextMilestone: cur?.text ?? (status === "done" ? "Done" : p.nextMilestone),
      startedAt: status === "active" && !p.startedAt ? new Date().toISOString() : p.startedAt,
    };
    if (status === "done" && p.status !== "done" && (!due || due === p.milestoneDue)) next.milestoneDue = toISO(today());
    const changes: string[] = [];
    if (next.milestoneDue !== p.milestoneDue) changes.push(`target date moved to ${fmt(next.milestoneDue)}`);
    if (next.steps.length > p.steps.length) changes.push(`${next.steps.length - p.steps.length} step${next.steps.length - p.steps.length > 1 ? "s" : ""} added`);
    if (next.status !== p.status) changes.push(`now ${status === "active" ? "in progress" : status === "planned" ? "on the roadmap" : "complete"}`);
    onSave(next, changes.join(", "));
  };

  const dateLabel = status === "planned" ? "Target start" : status === "done" ? "Finished on" : "Target finish";
  return (
    <Sheet title="Edit project" onClose={onClose}>
      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 0 }}>
        <button className={status === "planned" ? "on" : ""} onClick={() => setStatus("planned")}>Roadmap</button>
        <button className={status === "active" ? "on" : ""} onClick={() => setStatus("active")}>In progress</button>
        <button className={status === "done" ? "on" : ""} onClick={() => setStatus("done")}>Done</button>
      </div>
      <label className="f">Project<input className="f" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="f">One-line summary<input className="f" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <label className="f">{dateLabel}<input className="f" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>

      <div className="f" style={{ marginTop: 14 }}>
        <span className="flabel">Steps <span className="tiny muted">(these drive the % and the tracker)</span></span>
        <div className="step-edit">
          {steps.map((s, i) => (
            <div key={s.id} className="step-edit-row">
              <input type="checkbox" checked={s.done} aria-label="Done" onChange={() => setStep(i, { done: !s.done, doneAt: !s.done ? new Date().toISOString() : undefined })} />
              <input className="f" value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} aria-label={`Step ${i + 1}`} />
              <button className="btn ghost sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost sm" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn ghost sm" aria-label="Remove step" style={{ color: "var(--red)" }} onClick={() => setSteps(steps.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
          {steps.length === 0 && <p className="tiny muted" style={{ margin: "4px 0" }}>No steps yet.</p>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <textarea
            className="f"
            style={{ minHeight: 44, margin: 0 }}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a step (or paste several, one per line)"
          />
          <button className="btn sm" disabled={!adding.trim()} onClick={add}>Add</button>
        </div>
      </div>

      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!name.trim()} onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}
