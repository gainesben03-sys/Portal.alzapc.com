"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { NoteCard } from "@/components/notes";
import { Note, NoteKind } from "@/lib/modules";
import { notifyBen, useStore } from "@/lib/store";
import { ADVISOR } from "@/lib/data";

const KINDS: { k: NoteKind; hint: string }[] = [
  { k: "Need", hint: "Something you need from Alza" },
  { k: "Question", hint: "A quick HR question" },
  { k: "Message", hint: "An update or FYI" },
];

export default function Board() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, notes, patch, viewer, config } = useStore();
  const client = getClient(clientId);
  const [kind, setKind] = useState<NoteKind>("Need");
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (!ok || !client) return null;
  if (!config[clientId]?.modules.board)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">The note board isn't turned on for this workspace.</div></main>
      </div>
    );

  const author = viewer?.kind === "client" ? viewer.person : ADVISOR;
  const mine = notes.filter((n) => n.clientId === client.id).sort((a, b) => b.at.localeCompare(a.at));

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const n: Note = {
      id: `n${Date.now()}`,
      clientId: client.id,
      author,
      kind,
      text: text.trim(),
      urgent,
      at: new Date().toISOString(),
      status: "new",
      replies: [],
    };
    const sent = await notifyBen(
      `${urgent ? "URGENT: " : ""}${client.name} ${kind.toLowerCase()} from ${author.name}`,
      `${author.name} (${author.role}) at ${client.name} posted a ${kind.toLowerCase()} on the note board:\n\n${n.text}\n\nOpen the portal: https://portal.alzapc.com/console/board`
    );
    patch({ notes: [{ ...n, emailed: sent }, ...notes] });
    setText("");
    setUrgent(false);
    setBusy(false);
    toast.show(sent ? "Posted. Ben has been emailed." : "Posted. Email alerts aren't connected yet.");
  };

  const reply = async (n: Note, t: string) => {
    patch({
      notes: notes.map((x) =>
        x.id === n.id ? { ...x, status: x.status === "done" ? "seen" : x.status, replies: [...x.replies, { by: author.name, text: t, at: new Date().toISOString() }] } : x
      ),
    });
    await notifyBen(`${client.name}: reply from ${author.name}`, `${author.name} replied on the note board:\n\n${t}`);
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Note board</h1>
        <p className="muted" style={{ marginTop: 6 }}>Leave Ben a note, a question or a request. He gets an email as soon as you post.</p>

        <div className="card section" style={{ marginTop: 16 }}>
          <div className="seg" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 0 }}>
            {KINDS.map(({ k }) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {k}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>{KINDS.find((x) => x.k === kind)!.hint}</p>
          <textarea
            className="f"
            style={{ marginTop: 8 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === "Need" ? "We need a template for..." : kind === "Question" ? "Quick question about..." : "Heads up..."}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <label className="row" style={{ gap: 10, cursor: "pointer" }}>
              <span className="switch">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                <span />
              </span>
              <span className="small">Time-sensitive</span>
            </label>
            <button className="btn primary" disabled={!text.trim() || busy} onClick={post}>
              {busy ? "Posting..." : "Post to Ben"}
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Not for confidential employee complaints. For those, call or email Ben directly.
          </p>
        </div>

        <div className="section-head section">
          <h2>Recent notes</h2>
        </div>
        {mine.length === 0 && <div className="card small muted">No notes yet.</div>}
        {mine.map((n) => (
          <NoteCard key={n.id} n={n} onReply={(t) => reply(n, t)} />
        ))}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
