"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { ClientTopbar, Sheet, Toast, UrgencyPill, useGuard, useToast } from "@/components/ui";
import { addBusinessDays, escalationTarget, fmt, fmtTime, parseDay, reminderPlan, STATUS_LABEL, toISO, today } from "@/lib/data";
import { clientById, useStore } from "@/lib/store";

export default function ActionDetail() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const client = clientById(clientId);
  const ok = useGuard("client", clientId);
  const { actions, rules, viewer, update } = useStore();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "extension" | "revision">(null);
  const [comment, setComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const a = actions.find((x) => x.id === id && x.clientId === clientId);
  if (!ok || !client) return null;
  if (!a)
    return (
      <>
        <ClientTopbar client={client} />
        <main className="wrap">
          <div className="card">That item isn't available.</div>
        </main>
      </>
    );

  const isAdvisor = viewer?.kind === "advisor";
  const open = a.status !== "completed";
  const clientCanAct = !isAdvisor && a.side === "client" && open;
  const plan = a.side === "client" ? reminderPlan(a, client, rules) : [];
  const primaryLabel = a.kind === "approval" ? "Approve" : a.kind === "feedback" ? "Submit feedback" : "Mark as sent";

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <main className="wrap">
        <Link href={isAdvisor ? "/console" : `/c/${client.id}`} className="small" style={{ color: "var(--blue)" }}>
          ← {isAdvisor ? "Console" : "All items"}
        </Link>

        <div style={{ marginTop: 12 }}>
          <UrgencyPill a={a} />
          <h1 style={{ marginTop: 10 }}>{a.title}</h1>
          {a.detail && (
            <p className="muted" style={{ marginTop: 8 }}>
              {a.detail}
            </p>
          )}
        </div>

        {a.impact && open && (
          <div className="impact" style={{ marginTop: 14 }}>
            <b>Why it matters:</b> {a.impact}
          </div>
        )}

        <div className="card section">
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Owner</dt>
            <dd>{a.side === "alza" ? "Ben Gaines, Alza" : `${a.owner.name}, ${a.owner.role}`}</dd>
            <dt>Due</dt>
            <dd>{fmt(a.due)}</dd>
            <dt>Status</dt>
            <dd>{STATUS_LABEL[a.status]}</dd>
            {a.extension && (
              <>
                <dt>Extension</dt>
                <dd>
                  Asked for {fmt(a.extension.requested)}. {a.extension.reason}
                </dd>
              </>
            )}
            {a.side === "client" && (
              <>
                <dt>Escalates to</dt>
                <dd>{escalationTarget(a, client)}</dd>
              </>
            )}
          </dl>
        </div>

        {a.attachments.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2>Files</h2>
            </div>
            <div className="card">
              {a.attachments.map((f, i) => (
                <div className="file" key={i}>
                  <div className="ic">{f.name.split(".").pop()?.toUpperCase()}</div>
                  <div className="grow">
                    <div>{f.name}</div>
                    <div className="tiny muted">From {f.from}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2>Reminders</h2>
              {isAdvisor && <Link href="/console/rules">Edit rules</Link>}
            </div>
            <div className="card">
              <ul className="timeline">
                {plan.map((s, i) => (
                  <li key={i} className={s.state}>
                    <b>{s.label}</b> · {fmt(s.date)}
                    <div className="tiny muted">
                      {s.state === "sent" ? "Sent" : s.state === "next" ? "Next up" : s.state === "skipped" ? "Not needed" : "Scheduled"} · to{" "}
                      {s.to}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="section">
          <div className="section-head">
            <h2>Activity</h2>
          </div>
          <div className="card">
            <ul className="timeline">
              {[...a.history].reverse().map((h, i) => (
                <li key={i} className="sent">
                  {h.text}
                  <div className="tiny muted">
                    {h.by} · {fmtTime(h.at)}
                  </div>
                </li>
              ))}
            </ul>
            <form
              style={{ display: "flex", gap: 8, marginTop: 4 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                update(a.id, {}, `Comment: ${comment.trim()}`);
                setComment("");
              }}
            >
              <input className="f" placeholder="Add a comment or question" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button className="btn">Post</button>
            </form>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const who = viewer?.kind === "client" ? viewer.person.name : "Ben Gaines";
            update(
              a.id,
              { attachments: [...a.attachments, { name: f.name, from: who }], status: a.side === "client" ? "submitted" : a.status },
              `Uploaded ${f.name}`
            );
            toast.show("File added. Ben has been notified.");
            e.target.value = "";
          }}
        />
      </main>

      {clientCanAct && (
        <div className="actionbar">
          <div className="inner">
            <button className="btn" onClick={() => setSheet("extension")}>
              More time
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <button
              className="btn primary"
              onClick={() => {
                update(a.id, { status: "completed" }, a.kind === "approval" ? "Approved" : "Marked complete");
                toast.show("Done. Ben has been notified.");
              }}
            >
              {primaryLabel}
            </button>
          </div>
          {a.kind === "approval" && (
            <div style={{ maxWidth: 720, margin: "8px auto 0", textAlign: "center" }}>
              <button className="btn ghost sm" onClick={() => setSheet("revision")}>
                Request changes instead
              </button>
            </div>
          )}
        </div>
      )}

      {isAdvisor && open && (
        <div className="actionbar">
          <div className="inner">
            {a.side === "client" ? (
              <button
                className="btn"
                onClick={() => {
                  update(a.id, {}, `Manual reminder sent to ${a.owner.name}`);
                  toast.show(`Reminder sent to ${a.owner.name}`);
                }}
              >
                Nudge
              </button>
            ) : (
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Share file
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                const next = toISO(addBusinessDays(parseDay(a.due) < today() ? today() : parseDay(a.due), 3));
                update(a.id, { due: next, extension: undefined, status: a.status === "extension_requested" ? "in_progress" : a.status }, `Due date moved to ${fmt(next)}`);
                toast.show(`Due date moved to ${fmt(next)}`);
              }}
            >
              +3 days
            </button>
            <button
              className="btn primary"
              onClick={() => {
                update(a.id, { status: "completed" }, "Marked complete by Alza");
                toast.show("Marked complete");
              }}
            >
              Complete
            </button>
          </div>
        </div>
      )}

      {sheet === "extension" && <ExtensionSheet onClose={() => setSheet(null)} onSubmit={(date, reason) => {
        update(a.id, { status: "extension_requested", extension: { requested: date, reason } }, `Asked to move due date to ${fmt(date)}: ${reason}`);
        setSheet(null);
        toast.show("Request sent to Ben");
      }} />}

      {sheet === "revision" && (
        <RevisionSheet
          onClose={() => setSheet(null)}
          onSubmit={(note) => {
            update(a.id, { status: "needs_revision", side: "alza", due: toISO(addBusinessDays(today(), 2)) }, `Requested changes: ${note}. Back with Alza for a revision.`);
            setSheet(null);
            toast.show("Sent back to Ben with your notes");
          }}
        />
      )}

      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

function ExtensionSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (date: string, reason: string) => void }) {
  const [date, setDate] = useState(toISO(addBusinessDays(today(), 3)));
  const [reason, setReason] = useState("");
  return (
    <Sheet title="Ask for more time" onClose={onClose}>
      <label className="f">New date</label>
      <input className="f" type="date" value={date} min={toISO(today())} onChange={(e) => setDate(e.target.value)} />
      <label className="f">Quick reason (optional)</label>
      <textarea className="f" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Board meeting this week, can review Monday" />
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSubmit(date, reason.trim() || "No reason given")}>Send request</button>
      </div>
    </Sheet>
  );
}

function RevisionSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Sheet title="Request changes" onClose={onClose}>
      <label className="f">What needs to change?</label>
      <textarea className="f" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comp language in JD #2 needs another look" />
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!note.trim()} onClick={() => onSubmit(note.trim())}>Send to Ben</button>
      </div>
    </Sheet>
  );
}
