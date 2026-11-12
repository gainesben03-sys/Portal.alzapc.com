"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { fmtTime, toISO, today } from "@/lib/data";
import { Candidate, CandidateBrief, daysSince, Decision, DECISION_LABEL } from "@/lib/modules";
import { notifyBen, useStore } from "@/lib/store";
import { BriefBlock, deletePitchFiles, PitchContact, PitchLinkCard, PitchMedia, ReviewerLinks, RoleSheet, ShareSheet } from "@/components/pitch";
import { OutsideReview, pastCutoff } from "@/lib/pitch";
import { authHeader, LIVE, sb } from "@/lib/supabase";
import { Role } from "@/lib/modules";

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
  const { getClient, roles, candidates, patch, actions, update, who, config, notice, viewer, me, hires, live } = useStore();
  const client = getClient(clientId);
  const [view, setView] = useState<Record<string, "cards" | "compare">>({});
  const [fb, setFb] = useState<Candidate | null>(null);
  const [roleEdit, setRoleEdit] = useState<Role | "new" | null>(null);
  const [sharing, setSharing] = useState<{ c: Candidate; role: Role } | null>(null);
  const [showPassed, setShowPassed] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Candidate | null>(null);
  const [showCleared, setShowCleared] = useState<Record<string, boolean>>({});
  const toast = useToast();
  // yes/no from reviewer links live in their own table (the server writes them)
  const [outside, setOutside] = useState<Record<string, OutsideReview[]>>({});
  useEffect(() => {
    if (!ok || !LIVE) return;
    sb()
      .from("outside_reviews")
      .select("candidate_id, data")
      .eq("client_id", clientId)
      .then(({ data, error }) => {
        if (error) return;
        const m: Record<string, OutsideReview[]> = {};
        for (const r of data ?? []) (m[r.candidate_id as string] ??= []).push(r.data as OutsideReview);
        setOutside(m);
      });
  }, [ok, clientId]);
  // AI resume summaries: write any that are missing when Ben or an executive opens the page
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [briefing, setBriefing] = useState("");
  const candRef = useRef(candidates);
  candRef.current = candidates;
  const writeBriefs = async (ids: string[] | "missing", msg: string) => {
    if (!LIVE) return;
    setBriefing(msg);
    try {
      for (let round = 0; round < 5; round++) {
        const r = await fetch("/api/candidates/brief", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(ids === "missing" ? { clientId, missing: true } : { clientId, ids }) });
        const j = await r.json().catch(() => ({ ok: false }));
        if (!j.ok) break;
        const got = j.briefs as Record<string, CandidateBrief>;
        if (Object.keys(got).length) patch({ candidates: candRef.current.map((x) => (got[x.id] ? { ...x, brief: got[x.id] } : x)) });
        if (ids !== "missing" || !j.left) break;
      }
    } finally {
      setBriefing("");
    }
  };
  const canBrief = viewer?.kind === "advisor" || me?.access === "exec";
  const missingBriefs = candidates.filter((c) => roles.some((r) => r.id === c.roleId && r.clientId === clientId) && c.pitch && !c.cleared && !c.brief).length;
  const asked = useRef(false);
  useEffect(() => {
    if (!ok || !LIVE || !canBrief || asked.current || missingBriefs === 0) return;
    asked.current = true;
    writeBriefs("missing", `Writing summaries for ${missingBriefs} candidate${missingBriefs === 1 ? "" : "s"}…`);
  }, [ok, canBrief, missingBriefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const shareAll = (roleId: string) => {
    const n = candidates.filter((c) => c.roleId === roleId && c.hidden && c.screened !== "passed").length;
    if (!n || !confirm(`Share ${n} pitch${n === 1 ? "" : "es"} with everyone at ${client?.name ?? "the client"} who can see Recruiting? They'll be able to watch the videos and say yes or no.`)) return;
    patch({ candidates: candidates.map((c) => (c.roleId === roleId && c.hidden && c.screened !== "passed" ? { ...c, hidden: false, screened: "shared" as const, stage: "Shared with you", sentAt: toISO(today()) } : c)) });
  };
  const reviewsFor = (c: Candidate) => (LIVE ? outside[c.id] ?? [] : c.reviews ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));

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
  const isAdvisor = viewer?.kind === "advisor";
  const canEdit = isAdvisor || me?.access === "exec";
  const cfg = config[clientId];
  const pass = (c: Candidate) => {
    patch({ candidates: candidates.map((x) => (x.id === c.id ? { ...x, screened: "passed" as const, stage: "Not moving forward", decidedAt: new Date().toISOString() } : x)) });
    toast.show(`${c.name.split(" ")[0]} passed. Only you can see this.`);
  };

  const saveFeedback = async (c: Candidate, decision: Decision, note: string) => {
    const at = new Date().toISOString();
    const nextCands = candidates.map((x) =>
      x.id === c.id ? { ...x, decision, feedback: note, feedbackBy: who, feedbackAt: at, decidedAt: decision === "hold" ? undefined : x.decidedAt && x.decision === decision ? x.decidedAt : at } : x
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
    const said = decision === "offer" ? "wants to make an offer to" : decision === "hold" ? "put on hold" : `said ${DECISION_LABEL[decision]} to`;
    const first = c.name.split(" ")[0];
    if (viewer?.kind !== "client") return toast.show(`${DECISION_LABEL[decision]} on ${first}`);
    notice({ clientId: client.id, kind: "feedback", text: `${who} ${said} ${c.name} (${role.title})`, href: `/c/${client.id}/recruiting` });
    const sent = await notifyBen(
      `${client.name}: ${who.split(" ")[0]} ${said} ${c.name} (${role.title})`,
      `${who} ${said} ${c.name} for ${role.title}.${note ? `\n\nNote: ${note}` : ""}\n\n${typeof window !== "undefined" ? window.location.origin : ""}/c/${client.id}/recruiting`
    );
    toast.show(`${DECISION_LABEL[decision] === "Yes" || DECISION_LABEL[decision] === "No" ? `${DECISION_LABEL[decision]} on ${first}` : "Saved"}.${sent ? " Ben's been told." : ""}`);
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <div className="row" style={{ alignItems: "center" }}>
          <h1 className="grow" style={{ margin: 0 }}>Recruiting</h1>
          {canEdit && <button className="btn primary sm" onClick={() => setRoleEdit("new")}>New role</button>}
        </div>
        {briefing && <div className="cc-status small">{briefing}</div>}
        {myRoles.length === 0 && (
          <div className="card section small muted">No open roles yet.{canEdit ? " Add one with New role" + (cfg?.videoScreening ? ", then create a pitch link to share with candidates." : ".") : " Ben adds roles here when a search starts."}</div>
        )}
        {myRoles.map((role) => {
          const all = candidates.filter((c) => c.roleId === role.id);
          const closed = pastCutoff(role.pitch?.closesAt);
          const clearedCount = all.filter((c) => c.cleared).length;
          const list = all
            .filter((c) => (c.cleared ? isAdvisor && showCleared[role.id] : true))
            // after the cutoff, the no's drop off the client's list; Ben still sees them until he clears them
            .filter((c) => isAdvisor || !(closed && c.decision === "pass"))
            .filter((c) => !c.hidden || (isAdvisor && c.screened !== "passed") || (isAdvisor && showPassed[role.id]));
          const toScreen = all.filter((c) => c.hidden && !c.screened).length;
          const passedCount = all.filter((c) => c.hidden && c.screened === "passed").length;
          const pending = list.filter((c) => !c.decision && !c.hidden && !c.cleared);
          const atRisk = pending.filter((c) => c.otherOffers);
          const mode = view[role.id] ?? "cards";
          return (
            <section className="section" key={role.id}>
              <div className="card">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <h3>{role.title}</h3>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {[role.dept, role.location, role.type].filter(Boolean).join(" · ")}
                    </div>
                    <div className="small muted">
                      Hiring manager: {role.hiringManager.name}{role.compRange ? ` · Range: ${role.compRange}` : ""}
                    </div>
                  </div>
                  <span className="pill later">{role.status}</span>
                  {canEdit && <button className="btn ghost sm" onClick={() => setRoleEdit(role)}>Edit</button>}
                </div>
                {cfg?.videoScreening && <PitchLinkCard role={role} canEdit={canEdit} toScreen={isAdvisor ? toScreen : 0} onToast={toast.show} />}
                {isAdvisor && <ReviewerLinks role={role} reviews={all.flatMap(reviewsFor)} onToast={toast.show} />}
                {pending.length > 0 && (
                  <div className="impact" style={{ marginTop: 12 }}>
                    <b>
                      {pending.length} candidate{pending.length === 1 ? "" : "s"} waiting on a yes or no
                    </b>{" "}
                    {(() => { const d = Math.max(...pending.map((c) => daysSince(c.sentAt))); return d === 0 ? "since today." : `for ${d} day${d === 1 ? "" : "s"}.`; })()}
                    {atRisk.length > 0 && (
                      <span style={{ color: "var(--red)" }}> {atRisk.length} {atRisk.length === 1 ? "has" : "have"} other offers in play.</span>
                    )}
                  </div>
                )}
                {list.length === 0 && <p className="small muted" style={{ marginTop: 10 }}>{role.pitch && cfg?.videoScreening ? "No pitches yet. Share the link above and they'll show up here." : "Alza is sourcing. Candidates will appear here."}</p>}
                {isAdvisor && clearedCount > 0 && (
                  <button className="linklike tiny" style={{ marginTop: 8, marginRight: 12 }} onClick={() => setShowCleared({ ...showCleared, [role.id]: !showCleared[role.id] })}>
                    {showCleared[role.id] ? "Hide" : "Show"} {clearedCount} cleared
                  </button>
                )}
                {isAdvisor && passedCount > 0 && (
                  <button className="linklike tiny" style={{ marginTop: 8 }} onClick={() => setShowPassed({ ...showPassed, [role.id]: !showPassed[role.id] })}>
                    {showPassed[role.id] ? "Hide" : "Show"} {passedCount} passed pitch{passedCount === 1 ? "" : "es"}
                  </button>
                )}
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

              {mode === "cards" && (() => {
                const f = filter[role.id] ?? "all";
                const st = (c: Candidate) => (c.hidden ? (c.screened === "passed" ? "no" : "screen") : c.cleared ? "cleared" : c.decision === "pass" ? "no" : c.decision ? "yes" : "waiting");
                const pills: [string, string][] = [["all", "All"], ...(isAdvisor && list.some((c) => st(c) === "screen") ? [["screen", "To screen"] as [string, string]] : []), ["waiting", "Waiting"], ["yes", "Yes"], ["no", "No"]];
                const shown = f === "all" ? list : list.filter((c) => st(c) === f);
                return (
                  <>
                    <div className="cc-filters">
                      {pills.map(([k, l]) => (
                        <button key={k} className={f === k ? "on" : ""} onClick={() => setFilter({ ...filter, [role.id]: k })}>
                          {l} <span>{k === "all" ? list.length : list.filter((c) => st(c) === k).length}</span>
                        </button>
                      ))}
                      {isAdvisor && list.some((c) => st(c) === "screen") && (
                        <button className="cc-rewrite" onClick={() => shareAll(role.id)}>Share all {list.filter((c) => st(c) === "screen").length} with the team</button>
                      )}
                      {isAdvisor && live && list.some((c) => c.pitch) && (
                        <button className="cc-rewrite" disabled={!!briefing} onClick={() => writeBriefs(list.filter((c) => c.pitch && !c.cleared).map((c) => c.id), `Rewriting ${role.title} summaries…`)}>Rewrite summaries</button>
                      )}
                    </div>
                    {shown.length === 0 && <p className="small muted">Nobody here.</p>}
                    <div className="cc-grid">
                      {shown.map((c) => (
                        <article className={`cc-card ${c.hidden ? "screening" : ""}`} key={c.id}>
                          {c.pitch && <PitchMedia c={c} />}
                          <div className="cc-body">
                            <div className="cc-head">
                              <div className="cc-who">
                                <h3>{c.name}</h3>
                                <span className="small muted">{[c.brief?.now || (!c.pitch ? c.headline : ""), c.pitch ? `Sent ${new Date(c.pitch.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""].filter(Boolean).join(" · ")}</span>
                              </div>
                              {c.hidden ? (
                                <span className={`pill ${c.screened === "passed" ? "later" : "soon"}`}>{c.screened === "passed" ? "Passed" : "To screen"}</span>
                              ) : c.cleared ? (
                                <span className="pill later">Cleared</span>
                              ) : c.decision ? (
                                <span className={`pill ${c.decision === "pass" ? "later" : "done"}`}>{c.decision === "pass" ? "✕ No" : c.decision === "advance" ? "✓ Yes" : DECISION_LABEL[c.decision]}</span>
                              ) : (
                                <span className={`pill ${c.otherOffers ? "overdue" : "soon"}`}>Waiting {daysSince(c.sentAt)}d</span>
                              )}
                            </div>
                            {c.hidden && <div className="tiny" style={{ color: "var(--amber)" }}>Only you can see this pitch until you share it.</div>}
                            {c.pitch ? (
                              <BriefBlock b={c.brief} pending={!!briefing && !c.brief} />
                            ) : (
                              <>
                                {c.summary && <p className="small" style={{ margin: 0 }}>{c.summary}</p>}
                                {c.strengths.length > 0 && <div className="chips">{c.strengths.map((x) => <span className="chip" key={x}>{x}</span>)}</div>}
                              </>
                            )}
                            {c.assessment && <div className="impact" style={{ margin: 0 }}><b>Alza assessment:</b> {c.assessment}</div>}
                            {c.feedback !== undefined && c.decision && (
                              <div className="reply" style={{ margin: 0 }}>
                                <b>{c.feedbackBy}:</b> {c.feedback || "No note"}
                                <div className="tiny muted">{c.feedbackAt && fmtTime(c.feedbackAt)}</div>
                              </div>
                            )}
                            {reviewsFor(c).length > 0 && (
                              <div className="reply outside-reviews" style={{ margin: 0 }}>
                                <span className="tiny muted" style={{ display: "block", marginBottom: 2 }}>Outside reviewers</span>
                                {reviewsFor(c).map((r) => (
                                  <div key={r.reviewerId} className="small">
                                    <b>{r.name}:</b> <span style={{ color: r.decision === "yes" ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{r.decision === "yes" ? "Yes" : "No"}</span>
                                    {r.note ? ` · ${r.note}` : ""} <span className="tiny muted">{fmtTime(r.at)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {c.pitch && <PitchContact c={c} />}
                            <div className="cc-foot">
                              {c.hidden ? (
                                <>
                                  {c.screened !== "passed" && <button className="btn ghost sm" onClick={() => pass(c)}>Pass</button>}
                                  <button className="btn sm primary grow" onClick={() => setSharing({ c, role })}>Share with {role.hiringManager.name.split(" ")[0]}</button>
                                </>
                              ) : c.cleared ? null : (
                                <>
                                  <button className={`btn sm yn-no ${c.decision === "pass" ? "on" : ""}`} aria-pressed={c.decision === "pass"} onClick={() => c.decision !== "pass" && saveFeedback(c, "pass", c.feedback ?? "")}>No</button>
                                  <button className={`btn sm yn-yes grow ${c.decision === "advance" || c.decision === "offer" ? "on" : ""}`} aria-pressed={c.decision === "advance"} onClick={() => c.decision !== "advance" && c.decision !== "offer" && saveFeedback(c, "advance", c.feedback ?? "")}>Yes</button>
                                </>
                              )}
                            </div>
                            <div className="cc-more">
                              {!c.hidden && !c.cleared && c.decision && <button className="linklike tiny" onClick={() => setFb(c)}>{c.feedback ? "Edit note" : "Add a note"}</button>}
                              {!c.hidden && !c.cleared && (c.decision === "offer" || c.decision === "advance") && config[clientId]?.modules.hires && (viewer?.kind === "advisor" || me?.access === "exec") && !hires.some((h) => h.clientId === clientId && h.name === c.name) && (
                                <Link href={`/c/${clientId}/hires/new?candidate=${c.id}`} className="linklike tiny">Start the hire</Link>
                              )}
                              {isAdvisor && c.pitch && live && <button className="linklike tiny" disabled={!!briefing} onClick={() => writeBriefs([c.id], "Rewriting the summary…")}>Rewrite summary</button>}
                              {isAdvisor && <button className="linklike tiny" onClick={() => setRemoving(c)}>{c.cleared ? "Delete" : "Clear"}</button>}
                              <span className="tiny muted">{c.stage}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                );
              })()}

              {mode === "compare" && list.some((x) => !x.hidden) && (
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="scroll-x">
                    <table className="compare">
                      <thead>
                        <tr>
                          <th>Criteria</th>
                          {list.filter((x) => !x.hidden).map((c) => (
                            <th key={c.id}>{c.name.split(" ")[0]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {role.criteria.map((cr, i) => (
                          <tr key={cr}>
                            <td>{cr}</td>
                            {list.filter((x) => !x.hidden).map((c) => (
                              <td key={c.id}><Score n={c.scores[i] ?? 0} /></td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <td><b>Your call</b></td>
                          {list.filter((x) => !x.hidden).map((c) => (
                            <td key={c.id}>
                              {c.decision ? DECISION_LABEL[c.decision] : (
                                <span className="yn"><button className="btn sm yn-no" onClick={() => saveFeedback(c, "pass", "")}>No</button><button className="btn sm yn-yes" onClick={() => saveFeedback(c, "advance", "")}>Yes</button></span>
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
        {!live && <p className="demo-note">Fictional candidates for the prototype.</p>}
      </main>

      {removing && (
        <Sheet title={removing.cleared ? `Delete ${removing.name}?` : `Clear ${removing.name}?`} onClose={() => setRemoving(null)}>
          {!removing.cleared && <p className="small">They come off {client.name}&apos;s list.{removing.pitch && !removing.mediaDeletedAt ? " Their pitch video and resume are deleted now." : ""} You can still see them under &quot;Show cleared&quot;.</p>}
          <p className="small muted">{removing.cleared ? "" : "Or "}Delete completely: the candidate, any feedback{removing.pitch ? ", their video and resume" : ""}, for everyone. Can&apos;t be undone.</p>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setRemoving(null)}>Cancel</button>
            <button
              className="btn sm"
              style={{ color: "var(--red)" }}
              onClick={async () => {
                const c = removing;
                setRemoving(null);
                if (c.pitch && live) await deletePitchFiles(c.id);
                patch({ candidates: candidates.filter((x) => x.id !== c.id) });
                toast.show(`${c.name} deleted`);
              }}
            >
              Delete completely
            </button>
            {!removing.cleared && (
              <button
                className="btn primary sm"
                onClick={async () => {
                  const c = removing;
                  setRemoving(null);
                  const now = new Date().toISOString();
                  let gone = false;
                  if (c.pitch?.mediaPath && live) {
                    await deletePitchFiles(c.id);
                    gone = true;
                  }
                  patch({ candidates: candidates.map((x) => (x.id === c.id ? { ...x, cleared: true, clearedAt: now, ...(gone && x.pitch ? { mediaDeletedAt: now, pitch: { ...x.pitch, mediaPath: undefined, resumePath: undefined } } : {}) } : x)) });
                  toast.show(`${c.name.split(" ")[0]} cleared`);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </Sheet>
      )}
      {roleEdit && <RoleSheet clientId={client.id} role={roleEdit === "new" ? undefined : roleEdit} people={cfg?.users ?? []} onClose={() => setRoleEdit(null)} onSaved={(m) => { setRoleEdit(null); toast.show(m); }} />}
      {sharing && <ShareSheet c={sharing.c} role={sharing.role} onClose={() => setSharing(null)} onDone={(m) => { setSharing(null); toast.show(m); }} />}
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
    <Sheet title={`${c.name.split(" ")[0]}: your call`} onClose={onClose}>
      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        {(["pass", "advance", "offer"] as Decision[]).map((k) => (
          <button key={k} className={d === k ? "on" : ""} onClick={() => setD(k)}>
            {DECISION_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="f">A note for Ben (optional)</label>
      <textarea className="f" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Strong on budgets, want to check references" />
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!d} onClick={() => d && onSave(c, d, note.trim())}>Save</button>
      </div>
    </Sheet>
  );
}
