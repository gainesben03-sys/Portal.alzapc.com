"use client";

import { useState } from "react";
import { Action, addBusinessDays, Person, toISO, today } from "@/lib/data";
import { Candidate, PortalUser, Role } from "@/lib/modules";
import { DEFAULT_PROMPTS, newPitch, PitchSettings, pitchOpen } from "@/lib/pitch";
import { pingTask } from "@/lib/pushclient";
import { useStore } from "@/lib/store";
import { authHeader, LIVE } from "@/lib/supabase";
import { Sheet } from "./ui";

const fmtSec = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");

// ------------------------------------------------------------------ roles

export function RoleSheet({ clientId, role, people, onClose, onSaved }: { clientId: string; role?: Role; people: PortalUser[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const { roles, patch } = useStore();
  const [title, setTitle] = useState(role?.title ?? "");
  const [dept, setDept] = useState(role?.dept ?? "");
  const [location, setLocation] = useState(role?.location ?? "");
  const [type, setType] = useState(role?.type ?? "Full-time");
  const [comp, setComp] = useState(role?.compRange ?? "");
  const [mgr, setMgr] = useState(role?.hiringManager.email ?? people.find((p) => p.access === "exec")?.email ?? "");
  const [criteria, setCriteria] = useState((role?.criteria ?? []).join("\n"));
  const [status, setStatus] = useState(role?.status ?? "Sourcing");
  const [err, setErr] = useState("");

  const save = () => {
    if (!title.trim()) return setErr("Add the role title.");
    const u = people.find((p) => p.email === mgr);
    const hiringManager: Person = u ? { name: u.name, role: u.role, email: u.email } : role?.hiringManager ?? { name: "Not set", role: "" };
    const base = { title: title.trim(), dept: dept.trim(), location: location.trim(), type, compRange: comp.trim(), hiringManager, status, criteria: criteria.split("\n").map((x) => x.trim()).filter(Boolean) };
    if (role) patch({ roles: roles.map((r) => (r.id === role.id ? { ...r, ...base } : r)) });
    else patch({ roles: [...roles, { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, clientId, ...base }] });
    onSaved(role ? "Role updated" : "Role added");
  };

  return (
    <Sheet title={role ? "Edit role" : "New role"} onClose={onClose}>
      <label className="f">Title<input className="f" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Event Producer" /></label>
      <div className="two">
        <label className="f">Team<input className="f" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Production" /></label>
        <label className="f">Location<input className="f" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, hybrid" /></label>
      </div>
      <div className="two">
        <label className="f">Type
          <select className="f" value={type} onChange={(e) => setType(e.target.value)}>{["Full-time", "Part-time", "Contract", "Temporary", "Internship"].map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="f">Pay range<input className="f" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="$85-100k" /></label>
      </div>
      <div className="two">
        <label className="f">Hiring manager
          <select className="f" value={mgr} onChange={(e) => setMgr(e.target.value)}>
            <option value="">Choose...</option>
            {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
          </select>
        </label>
        <label className="f">Status
          <select className="f" value={status} onChange={(e) => setStatus(e.target.value)}>{["Sourcing", "Interviewing", "Offer out", "Filled", "Paused"].map((t) => <option key={t}>{t}</option>)}</select>
        </label>
      </div>
      <label className="f">What matters most <span className="tiny muted">(one per line; used to score candidates)</span>
        <textarea className="f" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={"Runs large events end to end\nCalm with clients\nBudget ownership"} />
      </label>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" onClick={save}>{role ? "Save" : "Add role"}</button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ pitch link per role

export function PitchLinkCard({ role, canEdit, toScreen, onToast }: { role: Role; canEdit: boolean; toScreen: number; onToast: (m: string) => void }) {
  const { roles, patch } = useStore();
  const [editing, setEditing] = useState(false);
  const set = (p: PitchSettings | undefined) => patch({ roles: roles.map((r) => (r.id === role.id ? { ...r, pitch: p } : r)) });
  const p = role.pitch;
  const url = typeof window !== "undefined" && p ? `${window.location.origin}/pitch/${p.slug}` : "";

  if (!p)
    return canEdit ? (
      <div className="pitch-link empty">
        <div className="grow">
          <b className="small">Video screening</b>
          <div className="tiny muted">Get a link candidates use to send a 90-second video pitch. Easier than a cover letter, faster to review.</div>
        </div>
        <button className="btn sm" onClick={() => { set(newPitch(role.title)); onToast("Pitch link created"); }}>Create pitch link</button>
      </div>
    ) : null;

  const isOpen = pitchOpen(p);
  return (
    <div className="pitch-link">
      <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b className="small grow">Video screening <span className={`pill ${isOpen ? "done" : "later"}`} style={{ marginLeft: 6 }}>{isOpen ? "Taking pitches" : "Closed"}</span></b>
        {toScreen > 0 && <span className="pill soon">{toScreen} to screen</span>}
      </div>
      <div className="pitch-url">
        <code>{url.replace(/^https?:\/\//, "")}</code>
        <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(url).then(() => onToast("Link copied"))}>Copy</button>
        <a className="btn ghost sm" href={`/pitch/${p.slug}`} target="_blank" rel="noopener">Preview</a>
      </div>
      <div className="tiny muted">{fmtSec(p.maxSeconds)} max · {p.prompts.length} prompts · {p.review === "ben" ? "Ben screens first" : "Goes straight to your team"}</div>
      {canEdit && (
        <div className="chips" style={{ marginTop: 8 }}>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>Settings</button>
          <button className="btn ghost sm" onClick={() => { set({ ...p, open: !p.open }); onToast(p.open ? "Link closed. It now says the role isn't taking pitches." : "Link reopened"); }}>{p.open ? "Close link" : "Reopen link"}</button>
        </div>
      )}
      {editing && <PitchSettingsSheet p={p} onClose={() => setEditing(false)} onSave={(np) => { set(np); setEditing(false); onToast("Pitch settings saved"); }} />}
    </div>
  );
}

function PitchSettingsSheet({ p, onClose, onSave }: { p: PitchSettings; onClose: () => void; onSave: (p: PitchSettings) => void }) {
  const [v, setV] = useState<PitchSettings>(p);
  const [prompts, setPrompts] = useState(p.prompts.join("\n"));
  const tog = (k: "allowUpload" | "allowAudio" | "allowWritten" | "askResume" | "askLinkedin", label: string) => (
    <label className="sign-consent" style={{ marginTop: 8 }}>
      <input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <Sheet title="Pitch link settings" onClose={onClose}>
      <label className="f">Welcome message<textarea className="f" value={v.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} /></label>
      <label className="f">What to cover <span className="tiny muted">(one per line; shown while they record)</span>
        <textarea className="f" value={prompts} onChange={(e) => setPrompts(e.target.value)} placeholder={DEFAULT_PROMPTS.join("\n")} />
      </label>
      <div className="two">
        <label className="f">Time limit
          <select className="f" value={v.maxSeconds} onChange={(e) => setV({ ...v, maxSeconds: Number(e.target.value) })}>{[60, 90, 120].map((n) => <option key={n} value={n}>{fmtSec(n)}</option>)}</select>
        </label>
        <label className="f">Stop taking pitches on <span className="tiny muted">(optional)</span><input className="f" type="date" value={v.closesAt ?? ""} onChange={(e) => setV({ ...v, closesAt: e.target.value || undefined })} /></label>
      </div>
      <label className="f">Who reviews pitches first
        <select className="f" value={v.review} onChange={(e) => setV({ ...v, review: e.target.value as PitchSettings["review"] })}>
          <option value="ben">Ben screens first, then shares the best</option>
          <option value="client">Straight to the hiring team</option>
        </select>
      </label>
      <div style={{ marginTop: 10 }}>
        <span className="flabel">Candidates can also</span>
        {tog("allowUpload", "Upload a video they recorded on their phone")}
        {tog("allowAudio", "Send audio only")}
        {tog("allowWritten", "Write it instead")}
        {tog("askResume", "Attach a resume")}
        {tog("askLinkedin", "Add their LinkedIn")}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" onClick={() => onSave({ ...v, prompts: prompts.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6).length ? prompts.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6) : DEFAULT_PROMPTS })}>Save</button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ the pitch itself

export function PitchView({ c }: { c: Candidate }) {
  const p = c.pitch!;
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = async (f: "media" | "resume") => {
    if (!LIVE) return setErr("Demo mode: pitches play once the portal is live.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/pitch/media?c=${encodeURIComponent(c.id)}&f=${f}`, { headers: await authHeader() });
      const j = await r.json();
      if (!j.ok) throw new Error(j.reason);
      if (f === "resume") window.open(j.url, "_blank", "noopener");
      else setSrc(j.url);
    } catch {
      setErr("Couldn't open it. Try again.");
    }
    setBusy(false);
  };
  return (
    <div className="pitch-view">
      {p.kind === "written" ? (
        <div className="pitch-written">{p.text}</div>
      ) : src ? (
        p.kind === "video" ? <video src={src} controls autoPlay playsInline className="pitch-live" /> : <audio src={src} controls autoPlay style={{ width: "100%" }} />
      ) : (
        <button className="pitch-play" onClick={() => open("media")} disabled={busy}>
          <span className="pitch-play-icon" aria-hidden="true">▶</span>
          <span>{busy ? "Loading..." : `${p.kind === "video" ? "Watch" : "Listen to"} pitch${p.seconds ? ` (${fmtSec(p.seconds)})` : ""}`}</span>
        </button>
      )}
      <div className="tiny muted pitch-contact">
        <a href={`mailto:${p.email}`}>{p.email}</a>
        {p.phone && <> · <a href={`tel:${p.phone}`}>{p.phone}</a></>}
        {p.linkedin && <> · <a href={p.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></>}
        {p.resumePath && <> · <button className="linklike" onClick={() => open("resume")}>Resume</button></>}
        {" · "}sent {new Date(p.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </div>
      {err && <p className="tiny" style={{ color: "var(--amber)" }}>{err}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Ben shares a pitch with the hiring team

export function ShareSheet({ c, role, onClose, onDone }: { c: Candidate; role: Role; onClose: () => void; onDone: (m: string) => void }) {
  const { candidates, roles, actions, patch, notice, viewer } = useStore();
  const [summary, setSummary] = useState(c.summary);
  const [assessment, setAssessment] = useState(c.assessment);
  const [strengths, setStrengths] = useState(c.strengths.join(", "));
  const [scores, setScores] = useState<number[]>(role.criteria.map((_, i) => c.scores[i] ?? 0));

  const share = () => {
    const now = new Date().toISOString();
    const first = c.name.split(" ")[0];
    const nextC = candidates.map((x) =>
      x.id === c.id
        ? { ...x, hidden: false, screened: "shared" as const, stage: "Shared with you", sentAt: toISO(today()), summary: summary.trim(), assessment: assessment.trim(), strengths: strengths.split(",").map((s) => s.trim()).filter(Boolean), scores }
        : x
    );
    // one feedback task per role for the hiring manager, with a step per candidate
    let nextA = actions;
    let nextR = roles;
    const open = actions.find((a) => a.id === role.feedbackActionId && a.status !== "completed");
    let taskId = open?.id;
    if (open) {
      nextA = actions.map((a) => (a.id === open.id ? { ...a, subtasks: [...(a.subtasks ?? []), { id: `s${Date.now().toString(36)}`, text: `Feedback on ${first}`, done: false }], history: [...a.history, { at: now, by: "Ben Gaines", text: `Added ${c.name}` }] } : a));
    } else if (role.hiringManager.email) {
      const a: Action = {
        id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        clientId: role.clientId,
        side: "client",
        kind: "feedback",
        title: `Feedback on ${role.title} candidates`,
        detail: "Watch each pitch and choose Advance, Hold, Pass or Offer. A sentence on why helps Ben tune the search.",
        impact: "Good candidates take other offers when feedback is slow.",
        owner: role.hiringManager,
        due: toISO(addBusinessDays(today(), 2)),
        status: "not_started",
        attachments: [],
        subtasks: [{ id: "s1", text: `Feedback on ${first}`, done: false }],
        history: [{ at: now, by: "Ben Gaines", text: "Candidates shared" }],
      };
      nextA = [...actions, a];
      nextR = roles.map((r) => (r.id === role.id ? { ...r, feedbackActionId: a.id } : r));
      taskId = a.id;
    }
    patch({ candidates: nextC, actions: nextA, roles: nextR });
    if (taskId) pingTask(taskId);
    if (viewer?.kind !== "advisor") notice({ clientId: role.clientId, kind: "feedback", text: `${c.name} shared for ${role.title}`, href: `/c/${role.clientId}/recruiting` });
    onDone(`${first} shared with ${role.hiringManager.name.split(" ")[0]}`);
  };

  return (
    <Sheet title={`Share ${c.name} with the hiring team`} onClose={onClose}>
      <label className="f">Summary <span className="tiny muted">(what they'll read first)</span><textarea className="f" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="8 years running corporate events; led a 2,000-person conference last year." /></label>
      <label className="f">Strengths <span className="tiny muted">(comma separated)</span><input className="f" value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Client calm, Budgets, Team lead" /></label>
      <label className="f">Your take<textarea className="f" value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="Strong communicator. Worth a 30-minute call." /></label>
      {role.criteria.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span className="flabel">Scores</span>
          {role.criteria.map((cr, i) => (
            <div key={cr} className="row" style={{ alignItems: "center", gap: 8, padding: "4px 0" }}>
              <span className="small grow">{cr}</span>
              <select className="f" style={{ width: 80 }} value={scores[i]} onChange={(e) => setScores(scores.map((s, j) => (j === i ? Number(e.target.value) : s)))}>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n || "-"}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 8 }}>{role.hiringManager.name} gets a feedback task and an alert. The pitch, contact details and resume become visible to their team.</p>
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" onClick={share}>Share</button>
      </div>
    </Sheet>
  );
}
