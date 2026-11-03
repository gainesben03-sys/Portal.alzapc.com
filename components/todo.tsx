"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui";
import { Action, ADVISOR, addBusinessDays, fmt, toISO, today } from "@/lib/data";
import { notifyBen, useStore } from "@/lib/store";
import { pingTask } from "@/lib/pushclient";
import { useAssignees } from "./projectedit";

/** Someone at the client adds a to-do for themselves, a teammate, or Ben. */
export function TodoSheet({ clientId, projectId, onClose, onDone }: { clientId: string; projectId?: string; onClose: () => void; onDone: (msg: string) => void }) {
  const { actions, projects, patch, viewer, me, who, getClient } = useStore();
  const people = useAssignees(clientId);
  const myName = viewer?.kind === "client" ? viewer.person.name : ADVISOR.name;
  const [owner, setOwner] = useState(myName);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(toISO(addBusinessDays(today(), 3)));
  const [proj, setProj] = useState(projectId ?? "");
  const [detail, setDetail] = useState("");
  const [steps, setSteps] = useState("");
  const open = projects.filter((p) => p.clientId === clientId && p.status !== "done");
  const o = people.find((p) => p.name === owner) ?? people.find((p) => p.name === myName);

  const save = () => {
    if (!title.trim() || !o) return;
    const now = new Date().toISOString();
    const forBen = o.name === ADVISOR.name;
    const mine = o.name === myName;
    const person = viewer?.kind === "client" ? { name: viewer.person.name, role: viewer.person.role, email: me?.email ?? viewer.person.email } : undefined;
    const a: Action = {
      id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      clientId,
      side: forBen ? "alza" : "client",
      kind: forBen ? "document" : "todo",
      title: title.trim(),
      detail: detail.trim(),
      owner: forBen ? ADVISOR : o,
      due,
      status: "not_started",
      projectId: proj || undefined,
      attachments: [],
      subtasks: steps.split("\n").map((x) => x.trim()).filter(Boolean).map((text, i) => ({ id: `s${i + 1}`, text, done: false })),
      history: [{ at: now, by: who, text: mine ? "Added to my to-dos" : `Added by ${who} for ${o.name}` }],
      requestedBy: forBen ? person : undefined,
    };
    patch({ actions: [...actions, a] });
    if (!forBen && !mine) pingTask(a.id);
    if (forBen && viewer?.kind === "client") notifyBen(`${getClient(clientId)?.name ?? "A client"}: a to-do for you`, `${who} added a to-do for you: ${a.title} (due ${fmt(due)})${a.detail ? `\n\n${a.detail}` : ""}`);
    onDone(mine ? "Added to your to-dos" : forBen ? "Sent to Ben" : `Added to ${o.name.split(" ")[0]}'s to-dos`);
  };

  return (
    <Sheet title="Add a to-do" onClose={onClose}>
      <label className="f">What needs doing<input className="f" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send the updated job description to the team" maxLength={140} /></label>
      <div className="todo-two">
        <label className="f">Who
          <select className="f" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {people.map((p) => <option key={p.name} value={p.name}>{p.name === myName ? `Me (${p.name})` : p.name === ADVISOR.name ? "Ben (Alza)" : p.name}</option>)}
          </select>
        </label>
        <label className="f">Due<input className="f" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      {open.length > 0 && (
        <label className="f">Part of a project <span className="tiny muted">(optional)</span>
          <select className="f" value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">No project</option>
            {open.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <label className="f">Notes <span className="tiny muted">(optional)</span><textarea className="f" style={{ minHeight: 56 }} value={detail} onChange={(e) => setDetail(e.target.value)} /></label>
      <label className="f">Checklist <span className="tiny muted">(optional, one per line)</span><textarea className="f" style={{ minHeight: 56 }} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
      <p className="tiny muted" style={{ margin: "4px 0 0" }}>{o && o.name !== myName ? `${o.name === ADVISOR.name ? "Ben" : o.name.split(" ")[0]} gets a heads-up, and reminders follow your company's rules.` : "Reminders follow your company's rules."}</p>
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!title.trim()} onClick={save}>Add</button>
      </div>
    </Sheet>
  );
}
