"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlzaNav, AlzaTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import { copyRich, copyText, deleteNewsletter, getNewsletter, KIND_AUDIENCE, KIND_LABEL, monthLabel, Newsletter, NlStatus, saveNewsletter, STATUS_LABEL } from "@/lib/newsletters";
import { NewsletterFrame, serializeFrame } from "@/components/newsletter";

export default function NewsletterIssue() {
  const ok = useGuard("advisor");
  const { id } = useParams<{ id: string }>();
  const { getClient } = useStore();
  const toast = useToast();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [n, setN] = useState<Newsletter | null>(null);
  const [missing, setMissing] = useState("");
  const [editing, setEditing] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [meta, setMeta] = useState({ subject: "", preview: "", sendFrom: "" });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!ok) return;
    getNewsletter(id).then((r) => {
      if (r.item) {
        setN(r.item);
        setMeta({ subject: r.item.subject, preview: r.item.preview ?? "", sendFrom: r.item.sendFrom ?? "" });
      } else setMissing(r.error === "setup" ? "Run supabase/008_newsletters.sql in Supabase first." : r.error ? `Couldn't load it: ${r.error}` : "This issue was deleted.");
    });
  }, [ok, id]);

  if (!ok) return null;
  const client = n ? getClient(n.clientId) : undefined;
  const metaDirty = !!n && (meta.subject !== n.subject || meta.preview !== (n.preview ?? "") || meta.sendFrom !== (n.sendFrom ?? ""));

  const save = async (patch: Partial<Newsletter>, msg: string) => {
    if (!n) return false;
    const next = { ...n, ...patch };
    setBusy(true);
    const e = await saveNewsletter(next);
    setBusy(false);
    if (e) {
      toast.show(`Didn't save: ${e}`);
      return false;
    }
    setN({ ...next, updatedAt: new Date().toISOString() });
    if (msg) toast.show(msg);
    return true;
  };

  const startEdit = () => {
    const d = frame.current?.contentDocument;
    if (!d) return;
    d.designMode = "on";
    setEditing(true);
  };
  const stopEdit = () => {
    const d = frame.current?.contentDocument;
    if (d) d.designMode = "off";
    setEditing(false);
  };
  const saveEdits = async () => {
    const html = serializeFrame(frame.current);
    stopEdit();
    if (!html) return toast.show("Couldn't read the edited email. Try again.");
    await save({ html, subject: meta.subject.trim() || n!.subject, preview: meta.preview.trim(), sendFrom: meta.sendFrom.trim() }, "Saved");
  };
  const cancelEdits = () => {
    stopEdit();
    setFrameKey((k) => k + 1); // reload the saved version
  };

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <Link href="/console/newsletters" className="small" style={{ color: "var(--blue)" }}>&larr; All newsletters</Link>
        {!n ? (
          <div className="card section small muted">{missing || "Loading..."}</div>
        ) : (
          <>
            <div className="section">
              <h1 style={{ margin: 0 }}>{KIND_LABEL[n.kind] ?? n.kind}</h1>
              <div className="small muted" style={{ marginTop: 2 }}><b>{client?.name ?? "Client"}</b> · {monthLabel(n.month)} · {KIND_AUDIENCE[n.kind] || "Email"}{n.lang.includes("es") ? " · English / Español" : ""}</div>
            </div>

            <div className="card nl-meta">
              <label className="f">Subject<input className="f" value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} /></label>
              <label className="f">Preview line <span className="tiny muted">(the gray text after the subject in the inbox)</span><input className="f" value={meta.preview} onChange={(e) => setMeta({ ...meta, preview: e.target.value })} /></label>
              <label className="f">Send from <span className="tiny muted">(the mailbox you paste it into)</span><input className="f" value={meta.sendFrom} onChange={(e) => setMeta({ ...meta, sendFrom: e.target.value })} placeholder="e.g. hr@blueprintstudios.com" /></label>
              {metaDirty && !editing && (
                <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button className="btn ghost sm" onClick={() => setMeta({ subject: n.subject, preview: n.preview ?? "", sendFrom: n.sendFrom ?? "" })}>Undo</button>
                  <button className="btn primary sm" disabled={busy} onClick={() => save({ subject: meta.subject.trim() || n.subject, preview: meta.preview.trim(), sendFrom: meta.sendFrom.trim() }, "Saved")}>Save</button>
                </div>
              )}

              <div className="nl-actions">
                <button className="btn primary sm" disabled={editing} onClick={async () => toast.show((await copyRich(n.html, frame.current)) ? "Email copied. Paste it into a new message." : "Couldn't copy. Click in the email, select all, then copy.")}>Copy email</button>
                <button className="btn sm" disabled={editing} onClick={async () => toast.show((await copyText(meta.subject)) ? "Subject copied" : "Couldn't copy")}>Copy subject</button>
                <button className="btn ghost sm" disabled={editing} onClick={async () => toast.show((await copyText(n.html)) ? "HTML copied" : "Couldn't copy")}>Copy HTML</button>
              </div>

              <div className="nl-actions">
                {editing ? (
                  <>
                    <span className="tiny" style={{ color: "var(--accent)", fontWeight: 700 }}>Editing: click into the email and type</span>
                    <span className="grow" />
                    <button className="btn ghost sm" onClick={cancelEdits}>Cancel</button>
                    <button className="btn primary sm" disabled={busy} onClick={saveEdits}>{busy ? "Saving..." : "Save changes"}</button>
                  </>
                ) : (
                  <>
                    <button className="btn sm" onClick={startEdit}>Edit wording</button>
                    {n.originalHtml && n.originalHtml !== n.html && <button className="btn ghost sm" onClick={() => setConfirmReset(true)}>Reset to original</button>}
                    <span className="grow" />
                    <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      Status
                      <select
                        className="f"
                        style={{ width: "auto", margin: 0, padding: "6px 8px" }}
                        value={n.status}
                        onChange={(e) => {
                          const status = e.target.value as NlStatus;
                          save({ status, sentAt: status === "sent" ? new Date().toISOString() : undefined }, status === "sent" ? "Marked sent" : "Status updated");
                        }}
                      >
                        {(Object.keys(STATUS_LABEL) as NlStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </label>
                    <button
                      className={`btn sm ${n.inLibrary ? "ghost" : ""}`}
                      disabled={busy}
                      onClick={() => save({ inLibrary: !n.inLibrary }, n.inLibrary ? `Removed from ${client?.name ?? "the client"}'s Library` : `Saved to ${client?.name ?? "the client"}'s Library`)}
                    >
                      {n.inLibrary ? "✓ In their Library (remove)" : "Save to their Library"}
                    </button>
                  </>
                )}
              </div>
              <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                To send: <b>Copy email</b>, open a new message{n.sendFrom ? <> in <b>{n.sendFrom}</b></> : ""}, paste, add the subject and recipients. {n.sentAt ? `Marked sent ${new Date(n.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}
              </p>
            </div>

            <div className={`nl-frame section ${editing ? "editing" : ""}`}>
              <NewsletterFrame key={frameKey} html={n.html} editable frameRef={frame} />
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => setConfirmDel(true)}>Delete issue</button>
            </div>
          </>
        )}
      </main>

      {confirmDel && n && (
        <Sheet title="Delete this issue?" onClose={() => setConfirmDel(false)}>
          <p className="small">{KIND_LABEL[n.kind]} for {client?.name}, {monthLabel(n.month)}. {n.inLibrary ? "It also comes out of their Library. " : ""}This can&apos;t be undone.</p>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setConfirmDel(false)}>Cancel</button>
            <button
              className="btn sm"
              style={{ background: "var(--red)", color: "#fff", borderColor: "var(--red)" }}
              onClick={async () => {
                const e = await deleteNewsletter(n.id);
                if (e) return toast.show(`Couldn't delete: ${e}`);
                router.push("/console/newsletters");
              }}
            >
              Delete
            </button>
          </div>
        </Sheet>
      )}
      {confirmReset && n && (
        <Sheet title="Go back to the original?" onClose={() => setConfirmReset(false)}>
          <p className="small">Your edits to this email are replaced with the version it started as.</p>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button
              className="btn primary sm"
              onClick={async () => {
                setConfirmReset(false);
                if (await save({ html: n.originalHtml! }, "Back to the original")) setFrameKey((k) => k + 1);
              }}
            >
              Reset
            </button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}
