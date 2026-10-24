"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { fmtTime } from "@/lib/data";
import { Candidate, daysSince, Decision, DECISION_LABEL } from "@/lib/modules";
import { notifyBen, useStore } from "@/lib/store";

function Score({ n }: { n: number }) {
  return (
    <span className="score" aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? "f" : ""} />
      ))}
    </span>
  );
}

export default function Recruiting() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, roles, candidates, patch, actions, update, who, config, notice, viewer } = useStore();
  const client = getClient(clientId);
  const [view, setView] = useState<Record<string, "cards" | "compare">>({});
  const [fb, setFb] = useState<Candidate | null>(null);
  const toast = useToast();

  if (!ok || !client) return null;
  if (!config[clientId]?.modules.recruiting)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">Recruiting isn't turned on for this workspace.</div></main>
      </div>
    );

  const myRoles = roles.filter((r) => r.clientId === client.id);

  const saveFeedback = async (c: Candidate, decision: Decision, note: string) => {
    const at = new Date().toISOString();
    const nextCands = candidates.map((x) =>
      x.id === c.id ? { ...x, decision, feedback: note, feedbackBy: who, feedbackAt: at } : x
    );
    patch({ candidates: nextCands });
    const role = roles.find((r) => r.id === c.roleId)!;
    const pending = nextCands.filter((x) => x.roleId === role.id && !x.decision);
    const linked = actions.find((a) => a.id === role.feedbackActionId);
    if (linked && linked.status !== "completed") {
      const first = c.name.split(" ")[0];
      const subtasks = linked.subtasks?.map((x) => (x.text.includes(first) ? { ...x, done: true } : x));
      update(
        linked.id,
        pending.length === 0 ? { status: "completed", subtasks } : { status: "in_progress", subtasks },
        `${DECISION_LABEL[decision]} on ${c.name}${pending.length === 0 ? ". All finalists have feedback." : ""}`
      );
    }
    setFb(null);
    if (viewer?.kind === "client")
      notice({ clientId: client.id, kind: "feedback", text: `${who}: ${DECISION_LABEL[decision]} on ${c.name} (${role.title})`, href: `/c/${client.id}/recruiting` });
    const sent = await notifyBen(
      `${client.name}: ${DECISION_LABEL[decision]} on ${c.name} (${role.title})`,
      `${who} marked ${c.name} as "${DECISION_LABEL[decision]}" for ${role.title}.\n\n${note || "(no note)"}`
    );
    toast.show(sent ? "Feedback saved. Ben has been emailed." : "Feedback saved.");
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Recruiting</h1>
        {myRoles.map((role) => {
          const list = candidates.filter((c) => c.roleId === role.id);
          const pending = list.filter((c) => !c.decision);
          const atRisk = pending.filter((c) => c.otherOffers);
          const mode = view[role.id] ?? "cards";
          return (
            <section className="section" key={role.id}>
              <div className="card">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <h3>{role.title}</h3>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {role.dept} · {role.location} · {role.type}
                    </div>
                    <div className="small muted">
                      Hiring manager: {role.hiringManager.name} · Range: {role.compRange}
                    </div>
                  </div>
                  <span className="pill later">{role.status}</span>
                </div>
                {pending.length > 0 && (
                  <div className="impact" style={{ marginTop: 12 }}>
                    <b>
                      {pending.length} candidate{pending.length === 1 ? "" : "s"} waiting on feedback
                    </b>{" "}
                    for {Math.max(...pending.map((c) => daysSince(c.sentAt)))} days.
                    {atRisk.length > 0 && (
                      <span style={{ color: "var(--red)" }}> {atRisk.length} {atRisk.length === 1 ? "has" : "have"} other offers in play.</span>
                    )}
                  </div>
                )}
                {list.length === 0 && <p className="small muted" style={{ marginTop: 10 }}>Alza is sourcing. Candidates will appear here.</p>}
              </div>

              {list.length > 0 && (
                <div className="tabs" style={{ marginTop: 12 }}>
                  <button className={`tab ${mode === "cards" ? "on" : ""}`} onClick={() => setView({ ...view, [role.id]: "cards" })}>
                    Candidates
                  </button>
                  <button className={`tab ${mode === "compare" ? "on" : ""}`} onClick={() => setView({ ...view, [role.id]: "compare" })}>
                    Compare
                  </button>
                </div>
              )}

              {mode === "cards" &&
                list.map((c) => (
                  <div className="card" key={c.id} style={{ marginTop: 10 }}>
                    <div className="action-top">
                      <div>
                        <h3>{c.name}</h3>
                        <div className="small muted">{c.headline}</div>
                      </div>
                      {c.decision ? (
                        <span className={`pill ${c.decision === "pass" ? "later" : "done"}`}>{DECISION_LABEL[c.decision]}</span>
                      ) : (
                        <span className={`pill ${c.otherOffers ? "overdue" : "soon"}`}>
                          <span className="dot" />
                          Waiting {daysSince(c.sentAt)}d
                        </span>
                      )}
                    </div>
                    <p className="small" style={{ marginTop: 10 }}>{c.summary}</p>
                    <div className="chips">
                      {c.strengths.map((s) => (
                        <span className="chip" key={s}>{s}</span>
                      ))}
                    </div>
                    <div className="impact">
                      <b>Alza assessment:</b> {c.assessment}
                    </div>
                    {c.feedback !== undefined && c.decision && (
                      <div className="reply">
                        <b>{c.feedbackBy}:</b> {c.feedback || "No note"}
                        <div className="tiny muted">{c.feedbackAt && fmtTime(c.feedbackAt)}</div>
                      </div>
                    )}
                    <div className="action-foot">
                      <span className="tiny muted">Stage: {c.stage}</span>
                      <button className={`btn sm ${c.decision ? "" : "primary"}`} style={{ marginLeft: "auto" }} onClick={() => setFb(c)}>
                        {c.decision ? "Update feedback" : "Give feedback"}
                      </button>
                    </div>
                  </div>
                ))}

              {mode === "compare" && list.length > 0 && (
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="scroll-x">
                    <table className="compare">
                      <thead>
                        <tr>
                          <th>Criteria</th>
                          {list.map((c) => (
                            <th key={c.id}>{c.name.split(" ")[0]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {role.criteria.map((cr, i) => (
                          <tr key={cr}>
                            <td>{cr}</td>
                            {list.map((c) => (
                              <td key={c.id}><Score n={c.scores[i] ?? 0} /></td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <td><b>Your call</b></td>
                          {list.map((c) => (
                            <td key={c.id}>
                              {c.decision ? DECISION_LABEL[c.decision] : (
                                <button className="btn sm" onClick={() => setFb(c)}>Decide</button>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="tiny muted" style={{ marginTop: 10 }}>Scores are Alza's assessment against the agreed criteria.</p>
                </div>
              )}
            </section>
          );
        })}
        <p className="demo-note">Fictional candidates for the prototype.</p>
      </main>

      {fb && <FeedbackSheet c={fb} onClose={() => setFb(null)} onSave={saveFeedback} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

function FeedbackSheet({
  c,
  onClose,
  onSave,
}: {
  c: Candidate;
  onClose: () => void;
  onSave: (c: Candidate, d: Decision, note: string) => void;
}) {
  const [d, setD] = useState<Decision | null>(c.decision ?? null);
  const [note, setNote] = useState(c.feedback ?? "");
  return (
    <Sheet title={`Feedback on ${c.name}`} onClose={onClose}>
      <div className="seg">
        {(Object.keys(DECISION_LABEL) as Decision[]).map((k) => (
          <button key={k} className={d === k ? "on" : ""} onClick={() => setD(k)}>
            {DECISION_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="f">A sentence or two (optional)</label>
      <textarea className="f" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Strong on budgets, want to check references" />
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!d} onClick={() => d && onSave(c, d, note.trim())}>Send to Ben</button>
      </div>
    </Sheet>
  );
}
