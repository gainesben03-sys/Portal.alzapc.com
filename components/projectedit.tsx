"use client";

import { useState } from "react";
import { ADVISOR, addBusinessDays, fmt, Person, Project, Subtask, toISO, today } from "@/lib/data";
import { notifyBen, useStore } from "@/lib/store";
import { pingTask } from "@/lib/pushclient";
import { syncStepTasks } from "@/lib/projecttasks";
import { Sheet } from "./ui";

/** Who a step can go to: Ben, or anyone at the client who isn't hiring-only. */
export function useAssignees(clientId: string): Person[] {
  const { config } = useStore();
  const users = (config[clientId]?.users ?? []).filter((u) => u.access !== "hiring");
  return [ADVISOR, ...users.map((u) => ({ name: u.name, role: u.role, email: u.email }))];
}

/** Save a project; steps with a person and a date become tasks on that person's list. */
export function useSaveProject() {
  const { projects, actions, patch, viewer, me, who, getClient } = useStore();
  const advisor = viewer?.kind === "advisor";
  return (next: Project, prev?: Project): number => {
    const person = viewer?.kind === "client" ? { name: viewer.person.name, role: viewer.person.role, email: me?.email ?? viewer.person.email } : undefined;
    const r = syncStepTasks(next, prev, actions, { name: who, advisor, person });
    patch({ projects: prev ? projects.map((x) => (x.id === next.id ? r.project : x)) : [...projects, r.project], actions: r.actions });
    for (const a of r.created) if (a.side === "client" && a.status !== "completed") pingTask(a.id);
    if (!advisor && r.forBen.length) {
      const c = getClient(next.clientId)?.name ?? "A client";
      notifyBen(`${c}: ${r.forBen.length === 1 ? "a project step" : `${r.forBen.length} project steps`} for you`, `${who} assigned you ${r.forBen.length === 1 ? "a step" : "steps"} in "${next.name}":\n\n${r.forBen.map((a) => `- ${a.title} (due ${fmt(a.due)})`).join("\n")}`);
    }
    return r.created.length;
  };
}

export function blankProject(clientId: string, by?: Person): Project {
  return { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, clientId, name: "", summary: "", status: "active", steps: [], nextMilestone: "", milestoneDue: toISO(addBusinessDays(today(), 20)), startedAt: new Date().toISOString(), createdBy: by };
}

const newStepId = () => `st${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Edit (or start) a project: name, summary, status, target date, and its steps with who and when. */
export function EditProjectSheet({ p, onClose, onSave, people, isNew }: { p: Project; onClose: () => void; onSave: (next: Project, note: string) => void; people?: Person[]; isNew?: boolean }) {
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
    <Sheet title={isNew ? "New project" : "Edit project"} onClose={onClose}>
      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 0 }}>
        <button className={status === "planned" ? "on" : ""} onClick={() => setStatus("planned")}>Roadmap</button>
        <button className={status === "active" ? "on" : ""} onClick={() => setStatus("active")}>In progress</button>
        <button className={status === "done" ? "on" : ""} onClick={() => setStatus("done")}>Done</button>
      </div>
      <label className="f">Project<input className="f" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="f">One-line summary<input className="f" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <label className="f">{dateLabel}<input className="f" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>

      <div className="f" style={{ marginTop: 14 }}>
        <span className="flabel">Steps <span className="tiny muted">(these drive the %{people ? ". Give a step a person and a date and it goes on their to-do list" : " and the tracker"})</span></span>
        <div className="step-edit">
          {steps.map((s, i) => (
            <div key={s.id} className="step-edit-row">
              <input type="checkbox" checked={s.done} aria-label="Done" onChange={() => setStep(i, { done: !s.done, doneAt: !s.done ? new Date().toISOString() : undefined })} />
              <input className="f" value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} aria-label={`Step ${i + 1}`} />
              <button className="btn ghost sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost sm" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn ghost sm" aria-label="Remove step" style={{ color: "var(--red)" }} onClick={() => setSteps(steps.filter((_, k) => k !== i))}>✕</button>
              {people && people.length > 0 && (
                <div className="step-assign">
                  <select className="f" aria-label={`Who does step ${i + 1}`} value={s.owner ? people.find((x) => x.name === s.owner!.name)?.name ?? "" : ""} onChange={(e) => { const o = people.find((x) => x.name === e.target.value); setStep(i, { owner: o, due: o ? s.due ?? toISO(addBusinessDays(today(), 5)) : s.due }); }}>
                    <option value="">No one yet</option>
                    {people.map((x) => <option key={x.name} value={x.name}>{x.name === ADVISOR.name ? "Ben (Alza)" : x.name}</option>)}
                  </select>
                  <input className="f" type="date" aria-label={`Due date for step ${i + 1}`} value={s.due ?? ""} onChange={(e) => setStep(i, { due: e.target.value || undefined })} />
                </div>
              )}
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
        <button className="btn primary sm" disabled={!name.trim()} onClick={save}>{isNew ? "Create project" : "Save"}</button>
      </div>
    </Sheet>
  );
}
