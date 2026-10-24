"use client";

import { useState } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { NoteCard } from "@/components/notes";
import { useStore } from "@/lib/store";

type F = "open" | "new" | "all";

export default function ConsoleBoard() {
  const ok = useGuard("advisor");
  const { notes, patch, getClient } = useStore();
  const [f, setF] = useState<F>("open");
  const toast = useToast();
  if (!ok) return null;

  const sorted = [...notes].sort((a, b) => Number(b.urgent && b.status !== "done") - Number(a.urgent && a.status !== "done") || b.at.localeCompare(a.at));
  const list = sorted.filter((n) => (f === "all" ? true : f === "new" ? n.status === "new" : n.status !== "done"));
  const counts = { open: notes.filter((n) => n.status !== "done").length, new: notes.filter((n) => n.status === "new").length, all: notes.length };

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <h1>Notes from clients</h1>
        <p className="muted" style={{ marginTop: 6 }}>Every note posted on a client board. You also get each one by email.</p>
        <div className="tabs section" style={{ marginTop: 14 }}>
          {(["open", "new", "all"] as F[]).map((k) => (
            <button key={k} className={`tab ${f === k ? "on" : ""}`} onClick={() => setF(k)}>
              {k === "open" ? "Open" : k === "new" ? "New" : "All"}
              <span className="count">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          {list.length === 0 && <div className="card small muted">Nothing here.</div>}
          {list.map((n) => (
            <NoteCard
              key={n.id}
              n={n}
              advisor
              clientName={getClient(n.clientId)?.name}
              onStatus={(status) => patch({ notes: notes.map((x) => (x.id === n.id ? { ...x, status } : x)) })}
              onReply={(text) => {
                patch({
                  notes: notes.map((x) =>
                    x.id === n.id
                      ? { ...x, status: x.status === "new" ? "seen" : x.status, replies: [...x.replies, { by: "Ben Gaines", text, at: new Date().toISOString() }] }
                      : x
                  ),
                });
                toast.show(`Reply posted. ${n.author.name.split(" ")[0]} gets an email in the full build.`);
              }}
            />
          ))}
        </div>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}
