"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui";
import { Action, ADVISOR, addBusinessDays, Kind, toISO, today } from "@/lib/data";
import { useStore } from "@/lib/store";
import { pingTask } from "@/lib/pushclient";

const KINDS: { k: Kind; label: string; hint: string }[] = [
  { k: "approval", label: "Approval", hint: "They review and sign off" },
  { k: "information", label: "Info needed", hint: "They send you data or answers" },
  { k: "document", label: "Document", hint: "They upload a file" },
  { k: "feedback", label: "Feedback", hint: "Their take on candidates or drafts" },
];

/** Ben creates a request for a client, or logs something he owes them. */
export function NewTaskSheet({ clientId, onClose, onCreated }: { clientId?: string; onClose: () => void; onCreated: (msg: string) => void }) {
  const { clients, getClient, config, projects, patch, actions } = useStore();
  const [cid, setCid] = useState(clientId ?? clients[0]?.id ?? "");
  const cfg = config[cid];
  const people = cfg?.users ?? [];
  const [who, setWho] = useState<string>(people[0]?.email ?? "alza");
  const [kind, setKind] = useState<Kind>("approval");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [impact, setImpact] = useState("");
  const [due, setDue] = useState(toISO(addBusinessDays(today(), 5)));
  const [projectId, setProjectId] = useState("");
  const [steps, setSteps] = useState("");

  const owner = who === "alza" ? ADVISOR : people.find((p) => p.email === who);
  const myProjects = projects.filter((p) => p.clientId === cid && p.status !== "done");

  const create = () => {
    if (!title.trim() || !cid || !owner) return;
    const now = new Date().toISOString();
    const a: Action = {
      id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      clientId: cid,
      side: who === "alza" ? "alza" : "client",
      kind: who === "alza" ? "document" : kind,
      title: title.trim(),
      detail: detail.trim(),
      impact: impact.trim() || undefined,
      owner: who === "alza" ? ADVISOR : { name: owner.name, role: owner.role, email: (owner as { email?: string }).email },
      due,
      status: "not_started",
      projectId: projectId || undefined,
      attachments: [],
      subtasks: steps
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((text, i) => ({ id: `s${i + 1}`, text, done: false })),
      history: [{ at: now, by: ADVISOR.name, text: who === "alza" ? "Added to Ben's list" : `Request created and assigned to ${owner.name}` }],
    };
    patch({ actions: [...actions, a] });
    if (a.side === "client") pingTask(a.id);
    onCreated(who === "alza" ? "Added to your list" : `Sent to ${owner.name}. Reminders follow your rules.`);
  };

  return (
    <Sheet title="New request" onClose={onClose}>
      <div style={{ maxHeight: "70vh", overflow: "auto", paddingRight: 2 }}>
        {!clientId && (
          <>
            <label className="f" style={{ marginTop: 0 }}>Client</label>
            <select className="f" value={cid} onChange={(e) => { setCid(e.target.value); setWho(config[e.target.value]?.users[0]?.email ?? "alza"); setProjectId(""); }}>
              {clients.map((c) => <option key={c.id} value={c.id}>{getClient(c.id)?.name}</option>)}
            </select>
          </>
        )}
        <label className="f" style={clientId ? { marginTop: 0 } : undefined}>Who owes it</label>
        <select className="f" value={who} onChange={(e) => setWho(e.target.value)}>
          {people.map((p) => <option key={p.email} value={p.email}>{p.name}, {p.role}</option>)}
          <option value="alza">Me (Ben owes this)</option>
        </select>
        {people.length === 0 && <p className="tiny muted" style={{ marginTop: 6 }}>Invite their team in Client setup to assign requests to them.</p>}

        {who !== "alza" && (
          <>
            <label className="f">Type</label>
            <div className="seg" style={{ marginTop: 0 }}>
              {KINDS.map((x) => (
                <button key={x.k} className={kind === x.k ? "on" : ""} onClick={() => setKind(x.k)}>{x.label}</button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>{KINDS.find((x) => x.k === kind)!.hint}</p>
          </>
        )}

        <label className="f">What's needed</label>
        <input className="f" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={who === "alza" ? "Draft new PTO policy" : "Approve revised job descriptions"} />
        <label className="f">Details (optional)</label>
        <textarea className="f" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Review the four updated JDs and approve, or flag anything that needs another pass." />
        {who !== "alza" && (
          <>
            <label className="f">Why it matters (optional, shown in red-flag spots)</label>
            <input className="f" value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="The org chart is on hold until these are approved." />
          </>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label className="f">Due</label>
            <input className="f" type="date" value={due} min={toISO(today())} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="f">Project</label>
            <select className="f" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {myProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <label className="f">Steps to check off (optional, one per line)</label>
        <textarea className="f" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"Review JD: Lead Producer\nReview JD: Producer"} />
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!title.trim() || !cid || !owner} onClick={create}>{who === "alza" ? "Add" : "Send request"}</button>
      </div>
    </Sheet>
  );
}
