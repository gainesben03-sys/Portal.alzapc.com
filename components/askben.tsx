"use client";

import { useState } from "react";
import { Action, ADVISOR, addBusinessDays, toISO, today } from "@/lib/data";
import { notifyBen, useStore } from "@/lib/store";
import { LIVE, uploadToStorage } from "@/lib/supabase";
import { Sheet } from "./ui";

const KINDS = ["A document or letter", "A policy question", "Help with an employee situation", "Hiring help", "Something else"];

/** A client asks Ben for something. It lands on Ben's "You owe" list and he gets an email and an alert. */
export function AskBenSheet({ clientId, onClose, onDone }: { clientId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const { actions, files, patch, viewer, who, notice, getClient } = useStore();
  const client = getClient(clientId)!;
  const [kind, setKind] = useState(KINDS[0]);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [due, setDue] = useState(toISO(addBusinessDays(today(), 5)));
  const [urgent, setUrgent] = useState(false);
  const [err, setErr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim()) return setErr("Add a short description of what you need.");
    if (file && file.size > 25e6) return setErr("Files can be up to 25 MB.");
    const now = new Date().toISOString();
    const person = viewer?.kind === "client" ? viewer.person : { name: who, role: "" };
    const a: Action = {
      id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      clientId,
      side: "alza",
      kind: "document",
      title: title.trim(),
      detail: [`${kind}.`, detail.trim()].filter(Boolean).join(" "),
      impact: urgent ? `${person.name} marked this urgent.` : undefined,
      owner: ADVISOR,
      due,
      status: "not_started",
      attachments: [],
      requestedBy: { name: person.name, role: person.role, email: person.email },
      history: [{ at: now, by: person.name, text: `Requested by ${person.name}${urgent ? " (urgent)" : ""}` }],
    };
    let newFiles = files;
    if (file) {
      setBusy(true);
      const fid = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      let path: string | undefined;
      try {
        if (LIVE) path = await uploadToStorage(clientId, fid, file);
      } catch {
        setBusy(false);
        return setErr("The file didn't upload. Try again, or send without it.");
      }
      a.attachments = [{ name: file.name, from: person.name, path }];
      newFiles = [{ id: fid, clientId, name: file.name, size: file.size, type: file.type, category: "Other", note: `For: ${a.title}`, confidential: false, by: person.name, at: now, reviewed: false, requestId: a.id, path }, ...files];
      setBusy(false);
    }
    patch({ actions: [...actions, a], files: newFiles });
    notice({ clientId, kind: "request", text: `${person.name} asked for: ${a.title}${urgent ? " (urgent)" : ""}`, href: `/c/${clientId}/a/${a.id}` });
    notifyBen(
      `${client.name}: ${urgent ? "URGENT " : ""}request from ${person.name}`,
      `${person.name} asked for: ${a.title}\nType: ${kind}\nNeeded by: ${due}${urgent ? "\nMarked urgent" : ""}\n\n${detail.trim() || "(no details)"}\n\nOpen it: https://portal.alzapc.com/c/${clientId}/a/${a.id}`
    );
    onDone("Sent to Ben. You'll see it under Ben is working on.");
  };

  return (
    <Sheet title="Ask Ben for something" onClose={onClose}>
      <label className="f">What kind of help
        <select className="f" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </label>
      <label className="f">What do you need?
        <input className="f" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Offer letter for our new office manager" />
      </label>
      <label className="f">Details <span className="tiny muted">(optional)</span>
        <textarea className="f" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Anything that helps Ben get it right the first time" />
      </label>
      <label className="f">Need it by
        <input className="f" type="date" value={due} min={toISO(today())} onChange={(e) => setDue(e.target.value)} />
      </label>
      <label className="sign-consent" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        <span>This is urgent</span>
      </label>
      <label className="f">Attach a file <span className="tiny muted">(optional)</span>
        <input className="f" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy} onClick={send}>{busy ? "Sending..." : "Send to Ben"}</button>
      </div>
    </Sheet>
  );
}
