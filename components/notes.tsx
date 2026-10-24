"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/data";
import { Note } from "@/lib/modules";

export const NOTE_STATUS = { new: "New", seen: "Seen by Ben", done: "Done" } as const;

export function NoteCard({
  n,
  clientName,
  onReply,
  advisor,
  onStatus,
}: {
  n: Note;
  clientName?: string;
  onReply: (text: string) => void;
  advisor?: boolean;
  onStatus?: (s: Note["status"]) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className={`card note k-${n.kind} ${n.urgent && n.status !== "done" ? "urgent" : ""}`}>
      <div className="action-top">
        <div className="small muted">
          {clientName && <b style={{ color: "var(--ink)" }}>{clientName} · </b>}
          {n.kind} from {n.author.name}, {n.author.role}
          {n.urgent && <span style={{ color: "var(--red)", fontWeight: 600 }}> · Urgent</span>}
        </div>
        <span className={`pill ${n.status === "done" ? "done" : n.status === "new" ? "soon" : "later"}`}>
          {advisor && n.status === "seen" ? "Seen" : NOTE_STATUS[n.status]}
        </span>
      </div>
      <p style={{ marginTop: 8 }}>{n.text}</p>
      <div className="tiny muted" style={{ marginTop: 4 }}>
        {fmtTime(n.at)}
        {n.emailed && " · emailed to Ben"}
      </div>
      {n.replies.map((r, i) => (
        <div className="reply" key={i}>
          <b>{r.by}:</b> {r.text}
          <div className="tiny muted">{fmtTime(r.at)}</div>
        </div>
      ))}
      {open ? (
        <form
          style={{ display: "flex", gap: 8, marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onReply(text.trim());
            setText("");
            setOpen(false);
          }}
        >
          <input className="f" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" />
          <button className="btn primary">Send</button>
        </form>
      ) : (
        <div className="action-foot">
          <button className="btn sm" onClick={() => setOpen(true)}>Reply</button>
          {advisor && onStatus && n.status === "new" && (
            <button className="btn sm" onClick={() => onStatus("seen")}>Mark seen</button>
          )}
          {advisor && onStatus && n.status !== "done" && (
            <button className="btn sm" onClick={() => onStatus("done")}>Mark done</button>
          )}
          {advisor && onStatus && n.status === "done" && (
            <button className="btn ghost sm" onClick={() => onStatus("seen")}>Reopen</button>
          )}
        </div>
      )}
    </div>
  );
}
