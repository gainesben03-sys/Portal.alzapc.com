"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { fmt, fmtTime } from "@/lib/data";
import { FILE_CATEGORIES, SharedFile } from "@/lib/modules";
import { notifyBen, useStore } from "@/lib/store";
import { LIVE, openStored, uploadToStorage } from "@/lib/supabase";

const MAX_MB = 25;
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function ShareWithHR() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, files, patch, actions, update, notice, who, viewer } = useStore();
  const client = getClient(clientId);
  const [picked, setPicked] = useState<File[]>([]);
  const [category, setCategory] = useState(FILE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  if (!ok || !client) return null;

  const requests = actions.filter((a) => a.clientId === client.id && a.side === "client" && a.kind !== "approval" && a.kind !== "feedback" && a.status !== "completed");
  const mine = files
    .filter((f) => f.clientId === client.id && !f.fromAdvisor && (!f.confidential || f.by === who || viewer?.kind === "advisor"))
    .sort((a, b) => b.at.localeCompare(a.at));

  const add = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_MB * 1e6) toast.show(`${f.name} is over ${MAX_MB} MB`);
      else ok.push(f);
    }
    setPicked((p) => [...p, ...ok]);
  };

  const submit = async () => {
    if (!picked.length) return;
    setBusy(true);
    const at = new Date().toISOString();
    const req = requests.find((r) => r.id === requestId);
    const newFiles: SharedFile[] = [];
    for (const [i, f] of picked.entries()) {
      const id = `f${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`;
      let path: string | undefined;
      if (LIVE) {
        try {
          path = await uploadToStorage(client.id, id, f);
        } catch {
          toast.show(`Couldn't upload ${f.name}. Try again.`);
          setBusy(false);
          return;
        }
      }
      newFiles.push({
        id,
        clientId: client.id,
        name: f.name,
        size: f.size,
        type: f.type,
        category,
        note: note.trim(),
        confidential,
        by: who,
        at,
        reviewed: false,
        requestId: req?.id,
        path,
      });
    }
    patch({ files: [...newFiles, ...files] });
    if (req) {
      update(
        req.id,
        { status: "submitted", attachments: [...req.attachments, ...newFiles.map((f) => ({ name: f.name, from: who, path: f.path }))] },
        `Shared ${newFiles.length} file${newFiles.length === 1 ? "" : "s"} through Share with HR`
      );
    }
    if (viewer?.kind === "client")
      notice({ clientId: client.id, kind: "upload", text: `${who} shared ${newFiles.length === 1 ? newFiles[0].name : `${newFiles.length} files`}${confidential ? " (confidential)" : ""}`, href: "/console/files" });
    const names = newFiles.map((f) => `- ${f.name} (${size(f.size)})`).join("\n");
    const sent = await notifyBen(
      `${client.name}: ${who} shared ${newFiles.length} file${newFiles.length === 1 ? "" : "s"}${confidential ? " (confidential)" : ""}`,
      `${who} shared files with you through the portal.\n\n${names}\n\nCategory: ${category}${req ? `\nFor: ${req.title}` : ""}${note.trim() ? `\nNote: ${note.trim()}` : ""}\n\nFiles stay in the portal, not in this email: https://portal.alzapc.com/console/files`
    );
    setPicked([]);
    setNote("");
    setConfidential(false);
    setRequestId("");
    setBusy(false);
    toast.show(sent ? "Shared. Ben has been notified." : "Shared with Ben.");
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Share with HR</h1>
        <p className="muted" style={{ marginTop: 6 }}>Send documents to Ben securely instead of over email. He's notified as soon as they land.</p>

        {requests.length > 0 && (
          <>
            <div className="section-head section"><h2>Ben has asked for</h2></div>
            <div className="card">
              {requests.map((r) => (
                <div className="row" key={r.id}>
                  <div className="grow">
                    <div className="title">{r.title}</div>
                    <div className="tiny muted">{r.owner.name} · due {fmt(r.due)}{r.status === "submitted" ? " · sent, Ben is reviewing" : ""}</div>
                  </div>
                  <button className="btn sm" onClick={() => { setRequestId(r.id); input.current?.click(); }}>Upload</button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="section-head section"><h2>Upload</h2></div>
        <div className="card">
          <button
            className="btn block"
            style={{ borderStyle: "dashed", padding: "22px 12px", flexDirection: "column", gap: 4 }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
          >
            <span>Choose files or take a photo</span>
            <span className="tiny muted" style={{ fontWeight: 400 }}>PDF, Word, Excel or images · up to {MAX_MB} MB each</span>
          </button>
          <input ref={input} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.heic,image/*" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

          {picked.length > 0 && (
            <>
              {picked.map((f, i) => (
                <div className="file" key={i} style={{ marginTop: 10 }}>
                  <div className="ic">{(f.name.split(".").pop() || "").slice(0, 4).toUpperCase()}</div>
                  <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                    <div className="ellipsis">{f.name}</div>
                    <div className="tiny muted">{size(f.size)}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => setPicked(picked.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              {requests.length > 0 && (
                <>
                  <label className="f">This is for</label>
                  <select className="f" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
                    <option value="">Not tied to a request</option>
                    {requests.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                </>
              )}
              <label className="f">Type</label>
              <select className="f" value={category} onChange={(e) => setCategory(e.target.value)}>
                {FILE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <label className="f">Note for Ben (optional)</label>
              <textarea className="f" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Signed copies for the personnel file" />
              <label className="rule" style={{ marginTop: 12, cursor: "pointer" }}>
                <span className="switch"><input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} /><span /></span>
                <div><b>Confidential</b><div className="tiny muted">Only Ben can open it. Not shown to the rest of your team.</div></div>
              </label>
              <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>
                {busy ? "Sending..." : `Send ${picked.length} file${picked.length === 1 ? "" : "s"} to Ben`}
              </button>
            </>
          )}
        </div>

        <div className="section-head section"><h2>Sent to HR</h2></div>
        <div className="card">
          {mine.length === 0 && <p className="small muted">Nothing shared yet.</p>}
          {mine.map((f) => (
              <div className="row" key={f.id}>
                <div className="grow">
                  <div className="title ellipsis">{f.name}</div>
                  <div className="tiny muted">{f.by} · {fmtTime(f.at)} · {f.category}{f.confidential ? " · confidential" : ""}</div>
                </div>
                {f.path && <button className="btn sm" onClick={() => openStored(f.path!).catch(() => toast.show("Couldn't open that file"))}>Open</button>}
                <span className={`pill ${f.reviewed ? "done" : "later"}`}>{f.reviewed ? "Reviewed" : "Received"}</span>
              </div>
            ))}
        </div>
        {!LIVE && <p className="demo-note">Demo mode: file names are recorded, contents aren't stored.</p>}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
