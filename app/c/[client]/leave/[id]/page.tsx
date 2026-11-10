"use client";

// One leave case: dates, leave types and eligibility review, compliance tasks, documents,
// intermittent time, extensions, return to work, notes, emails and the full history.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { dueLabel, EmailSheet, NOT_LEGAL, StatusPill, useAssignees } from "@/components/leaveui";
import { useStore } from "@/lib/store";
import { addDays, categoriesFor, CaseDoc, CaseTask, daysBetween, DOC_KIND, DocKind, Eligibility, fmtDay, LeaveCase, LeaveStatus, RTW_STEPS, Schedule, SCHEDULE_LABEL, STATUS_LABEL, tasksFor, today, weeksBetween } from "@/lib/leave";
import { leaveApi, useLeaveAccess, useLeaveCases } from "@/lib/leaveclient";
import { BUCKET, LIVE, sb } from "@/lib/supabase";

const ELIG: Record<Eligibility, string> = { not_reviewed: "Not reviewed", likely: "Looks eligible", not_likely: "Looks not eligible", n_a: "Doesn't apply" };
type Hist = { who: string; what: string; detail: string | null; at: string };
const uid = () => Math.random().toString(36).slice(2, 9);

export default function LeaveCasePage() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, viewer, me } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const acc = useLeaveAccess(clientId);
  const { cases, admins, save, replace } = useLeaveCases(clientId, acc.admin);
  const assignees = useAssignees(clientId, admins);
  const toast = useToast();
  const [emailing, setEmailing] = useState(false);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [note, setNote] = useState("");
  const [newTask, setNewTask] = useState({ title: "", due: "" });
  const [ext, setExt] = useState("");
  const [intm, setIntm] = useState({ date: today(), hours: "8", note: "" });
  const [docKind, setDocKind] = useState<DocKind>("medical");
  const [uploading, setUploading] = useState(false);
  const [editTypes, setEditTypes] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = cases?.find((x) => x.id === id) ?? null;

  const loadHist = async () => {
    if (!LIVE) {
      if (!c) return;
      setHist([
        ...c.notes.map((n) => ({ who: n.by, what: "added a note", detail: null, at: n.at })),
        ...c.emails.map((e) => ({ who: e.by, what: "sent an email", detail: `"${e.subject}" to ${e.to}`, at: e.at })),
        ...c.docs.map((d) => ({ who: d.by, what: "uploaded a document", detail: `${d.name}${d.medical ? " (medical, restricted)" : ""}`, at: d.at })),
        { who: c.assignedTo?.name ?? "Ben Gaines", what: "opened the case", detail: c.number, at: c.createdAt },
      ].sort((a, b) => (b.at > a.at ? 1 : -1)));
      return;
    }
    const j = await leaveApi(clientId, { action: "audit", caseId: id });
    setHist(j.ok ? j.history : []);
  };
  useEffect(() => {
    if (c && !hist) loadHist();
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!acc.ready || (acc.admin && !cases)) return shell(<p className="small muted">Loading…</p>);
  if (!acc.admin) return shell(<div className="card section small muted">This area is for HR administrators only.</div>);
  if (!c) return shell(<div className="card section small muted">Case not found. <Link href={`/c/${clientId}/leave`}>Back to the leave center</Link></div>);

  const cats = categoriesFor(cfg?.leave);
  const meP = { name: viewer?.kind === "client" ? viewer.person.name : "Ben Gaines", email: (me?.email ?? "ben@alzapc.com").toLowerCase() };
  const upd = async (p: Partial<LeaveCase>, msg = "Saved") => {
    const r = await save({ ...c, ...p });
    toast.show(typeof r === "string" ? r : msg);
    if (typeof r !== "string") setHist(null);
    return typeof r !== "string";
  };
  const setTask = (t: CaseTask, p: Partial<CaseTask>) => upd({ tasks: c.tasks.map((x) => (x.id === t.id ? { ...x, ...p } : x)) }, p.done ? "Done ✓" : "Saved");
  const back = c.extensions.filter((e) => e.status === "approved").map((e) => e.newEnd).sort().pop() || c.expectedEnd;
  const open = c.tasks.filter((t) => !t.done).sort((a, b) => (a.due ?? "9") < (b.due ?? "9") ? -1 : 1);
  const done = c.tasks.filter((t) => t.done);
  const catName = (cid: string) => cats.find((x) => x.id === cid)?.short ?? cid;
  const rtwDone = RTW_STEPS.filter((s) => c.rtw[s.key]).length;
  const showRtw = ["approved", "active", "extended", "returned"].includes(c.status) || rtwDone > 0;

  const upload = async (f: File) => {
    const medical = docKind === "medical";
    if (medical && !acc.medical) return toast.show("You don't have access to medical documents");
    if (f.size > 20e6) return toast.show("That file is over 20 MB");
    setUploading(true);
    try {
      if (!LIVE) {
        replace({ ...c, docs: [...c.docs, { id: uid(), name: f.name, path: "", kind: docKind, medical, size: f.size, at: new Date().toISOString(), by: meP.name }] });
        setHist(null);
        return toast.show("Uploaded (demo)");
      }
      const u = await leaveApi(clientId, { action: "uploadUrl", caseId: c.id, name: f.name });
      if (!u.ok) return toast.show("Couldn't start the upload");
      const { error } = await sb().storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, f, { contentType: f.type || undefined });
      if (error) return toast.show("Upload failed");
      const j = await leaveApi(clientId, { action: "addDoc", caseId: c.id, doc: { name: f.name, path: u.path, kind: docKind, medical, size: f.size } });
      if (!j.ok) return toast.show(j.reason === "medical" ? "You don't have access to medical documents" : "Couldn't save the document");
      replace(j.case);
      setHist(null);
      toast.show("Uploaded");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const openDoc = async (d: CaseDoc) => {
    if (d.medical && !acc.medical) return toast.show("Medical documents are restricted");
    if (!LIVE) return toast.show("Demo: documents open in the live portal (and the opening is logged)");
    const w = window.open("", "_blank");
    const j = await leaveApi(clientId, { action: "openDoc", caseId: c.id, docId: d.id });
    if (!j.ok) {
      w?.close();
      return toast.show(j.reason === "medical" ? "Medical documents are restricted" : "Couldn't open it");
    }
    if (w) w.location.href = j.url;
    else window.location.href = j.url;
    setHist(null);
  };
  const removeDoc = async (d: CaseDoc) => {
    if (!confirm(`Delete ${d.name}? This can't be undone.`)) return;
    if (!LIVE) {
      replace({ ...c, docs: c.docs.filter((x) => x.id !== d.id) });
      return toast.show("Deleted (demo)");
    }
    const j = await leaveApi(clientId, { action: "removeDoc", caseId: c.id, docId: d.id });
    if (!j.ok) return toast.show("Couldn't delete it");
    replace(j.case);
    setHist(null);
  };
  const setStatus = (s: LeaveStatus) => {
    const p: Partial<LeaveCase> = { status: s };
    if (s === "active" && !c.actualStart) p.actualStart = c.expectedStart && c.expectedStart <= today() ? c.expectedStart : today();
    if (s === "returned" && !c.actualEnd) p.actualEnd = today();
    if (s === "closed") p.closedAt = new Date().toISOString();
    upd(p, `Status: ${STATUS_LABEL[s]}`);
  };

  return shell(
    <>
      <Link href={`/c/${clientId}/leave?tab=cases`} className="tiny muted">← Leave center</Link>
      <div className="lv-head">
        <div className="grow">
          <div className="tiny muted">{c.number} · requested {fmtDay(c.requestedAt)}</div>
          <h1 style={{ margin: "2px 0 4px" }}>{c.employee.name}</h1>
          <div className="small muted">{[c.employee.title, c.employee.department, c.employee.manager ? `reports to ${c.employee.manager}` : ""].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="lv-headact">
          <StatusPill s={c.status} />
          <button className="btn" onClick={() => setEmailing(true)}>✉ Email</button>
        </div>
      </div>

      <div className="lv-detail section">
        <div className="lv-main">
          {/* status + owner */}
          <div className="card lv-top">
            <label className="f">Status
              <select className="f" value={c.status} onChange={(e) => setStatus(e.target.value as LeaveStatus)}>
                {(Object.keys(STATUS_LABEL) as LeaveStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="f">HR admin
              <select className="f" value={c.assignedTo?.email ?? ""} onChange={(e) => upd({ assignedTo: assignees.find((a) => a.email === e.target.value) })}>
                {!c.assignedTo && <option value="">Nobody yet</option>}
                {assignees.map((a) => <option key={a.email} value={a.email}>{a.name}</option>)}
                {c.assignedTo && !assignees.some((a) => a.email === c.assignedTo!.email) && <option value={c.assignedTo.email}>{c.assignedTo.name}</option>}
              </select>
            </label>
            <label className="f">Schedule
              <select className="f" value={c.schedule} onChange={(e) => upd({ schedule: e.target.value as Schedule })}>
                {(Object.keys(SCHEDULE_LABEL) as Schedule[]).map((s) => <option key={s} value={s}>{SCHEDULE_LABEL[s]}</option>)}
              </select>
            </label>
            {c.status === "denied" && <p className="tiny muted lv-full">Record the reason and the notice you sent in the notes. The decision is HR&apos;s, made with Ben or counsel.</p>}
          </div>

          {/* tasks */}
          <div className="card section">
            <h3 className="lv-h">Compliance checklist <span className="muted">· {open.length} open</span></h3>
            {open.length === 0 && <p className="small muted">All caught up.</p>}
            {open.map((t) => {
              const days = t.due ? daysBetween(today(), t.due) : null;
              return (
                <div key={t.id} className="lv-task">
                  <input type="checkbox" aria-label="Mark done" onChange={() => setTask(t, { done: true, doneAt: today(), doneBy: meP.name })} />
                  <span className="grow">
                    <b>{t.title}</b>
                    <span className="lv-sub">{[t.category, t.hint].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="lv-due">
                    <input type="date" className="f" value={t.due ?? ""} onChange={(e) => setTask(t, { due: e.target.value || undefined })} aria-label="Due date" />
                    {days != null && <span className={`pill ${days < 0 ? "overdue" : days <= 3 ? "soon" : "later"}`}>{dueLabel(days)}</span>}
                  </span>
                </div>
              );
            })}
            <div className="lv-addrow">
              <input className="f" placeholder="Add a task" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
              <input className="f lv-date" type="date" value={newTask.due} onChange={(e) => setNewTask({ ...newTask, due: e.target.value })} aria-label="Due" />
              <button className="btn sm" disabled={!newTask.title.trim()} onClick={async () => { if (await upd({ tasks: [...c.tasks, { id: uid(), title: newTask.title.trim().slice(0, 140), kind: "other", due: newTask.due || undefined, done: false }] }, "Task added")) setNewTask({ title: "", due: "" }); }}>Add</button>
            </div>
            {done.length > 0 && (
              <details className="lv-done">
                <summary className="tiny muted">{done.length} done</summary>
                {done.map((t) => (
                  <div key={t.id} className="lv-task done">
                    <input type="checkbox" checked aria-label="Mark not done" onChange={() => setTask(t, { done: false, doneAt: undefined, doneBy: undefined })} />
                    <span className="grow"><s>{t.title}</s><span className="lv-sub">{t.doneBy ? `${t.doneBy}, ` : ""}{fmtDay(t.doneAt)}</span></span>
                  </div>
                ))}
              </details>
            )}
          </div>

          {/* documents */}
          <div className="card section">
            <h3 className="lv-h">Documents</h3>
            {c.docs.length === 0 && <p className="small muted">Nothing uploaded yet.</p>}
            {c.docs.map((d) => (
              <div key={d.id} className="lv-doc">
                <span className="grow">
                  <b>{d.medical ? "🔒 " : ""}{d.name}</b>
                  <span className="lv-sub">{DOC_KIND[d.kind]} · {d.by}, {fmtDay(d.at.slice(0, 10))}{d.medical ? " · restricted" : ""}</span>
                </span>
                <button className="btn sm" disabled={d.medical && !acc.medical} onClick={() => openDoc(d)}>Open</button>
                <button className="btn sm lv-x" aria-label={`Delete ${d.name}`} onClick={() => removeDoc(d)}>✕</button>
              </div>
            ))}
            <div className="lv-addrow">
              <select className="f" value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)}>
                {(Object.keys(DOC_KIND) as DocKind[]).filter((k) => k !== "medical" || acc.medical).map((k) => <option key={k} value={k}>{DOC_KIND[k]}</option>)}
              </select>
              <button className="btn sm primary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "Upload"}</button>
              <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
            <p className="tiny muted">Medical documents are locked to HR admins with medical access, kept apart from the personnel file, never emailed, and every opening is logged.</p>
          </div>

          {/* intermittent */}
          {c.schedule !== "continuous" && (
            <div className="card section">
              <h3 className="lv-h">{c.schedule === "intermittent" ? "Intermittent time used" : "Reduced schedule"}</h3>
              <input className="f" placeholder="Schedule details, e.g. up to 2 days a month" defaultValue={c.scheduleNote ?? ""} onBlur={(e) => e.target.value !== (c.scheduleNote ?? "") && upd({ scheduleNote: e.target.value.trim() || undefined })} />
              {c.intermittent.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {[...c.intermittent].sort((a, b) => (b.date > a.date ? 1 : -1)).map((e) => (
                    <div key={e.id} className="lv-kv">
                      <span>{fmtDay(e.date)}{e.note ? <span className="muted"> · {e.note}</span> : null}</span>
                      <span><b>{e.hours}h</b> <button className="lv-linkbtn" aria-label="Remove" onClick={() => upd({ intermittent: c.intermittent.filter((x) => x.id !== e.id) })}>✕</button></span>
                    </div>
                  ))}
                  <div className="lv-kv"><span><b>Total</b></span><b>{c.intermittent.reduce((h, e) => h + e.hours, 0)}h</b></div>
                </div>
              )}
              <div className="lv-addrow">
                <input className="f lv-date" type="date" value={intm.date} onChange={(e) => setIntm({ ...intm, date: e.target.value })} aria-label="Date" />
                <input className="f lv-hrs" type="number" min={0.5} step={0.5} value={intm.hours} onChange={(e) => setIntm({ ...intm, hours: e.target.value })} aria-label="Hours" />
                <input className="f" placeholder="Note (no medical details)" value={intm.note} onChange={(e) => setIntm({ ...intm, note: e.target.value })} />
                <button className="btn sm" onClick={async () => { const h = Number(intm.hours); if (!intm.date || !(h > 0)) return; if (await upd({ intermittent: [...c.intermittent, { id: uid(), date: intm.date, hours: h, note: intm.note.trim() || undefined }] }, "Logged")) setIntm({ ...intm, note: "" }); }}>Log</button>
              </div>
            </div>
          )}

          {/* return to work */}
          {showRtw && (
            <div className="card section">
              <h3 className="lv-h">Return to work <span className="muted">· {rtwDone}/{RTW_STEPS.length}</span></h3>
              {RTW_STEPS.map((s) => (
                <label key={s.key} className="lv-check lv-rtw">
                  <input
                    type="checkbox"
                    checked={!!c.rtw[s.key]}
                    onChange={(e) => {
                      const p: Partial<LeaveCase> = { rtw: { ...c.rtw, [s.key]: e.target.checked } };
                      if (s.key === "actual" && e.target.checked && !c.actualEnd) {
                        p.actualEnd = today();
                        if (["active", "extended", "approved"].includes(c.status)) p.status = "returned";
                      }
                      if (s.key === "close" && e.target.checked) {
                        p.status = "closed";
                        p.closedAt = new Date().toISOString();
                      }
                      upd(p);
                    }}
                  />
                  {s.title}
                  {s.key === "confirm" && back ? <span className="muted"> ({fmtDay(back)})</span> : null}
                </label>
              ))}
            </div>
          )}

          {/* notes */}
          <div className="card section">
            <h3 className="lv-h">Notes</h3>
            <textarea className="f" placeholder="What happened, decisions, next steps. Keep diagnoses out of notes; they belong in the medical documents." value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="sheet-actions" style={{ marginTop: 8 }}>
              <button className="btn sm primary" disabled={!note.trim()} onClick={async () => { if (await upd({ notes: [{ id: uid(), at: new Date().toISOString(), by: meP.name, text: note.trim().slice(0, 4000) }, ...c.notes] }, "Note added")) setNote(""); }}>Add note</button>
            </div>
            {c.notes.map((n) => (
              <div key={n.id} className="lv-note">
                <div className="tiny muted">{n.by} · {new Date(n.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                <p>{n.text}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="lv-side">
          {/* dates */}
          <div className="card">
            <h3 className="lv-h">Dates</h3>
            {([["requestedAt", "Requested"], ["expectedStart", "Expected start"], ["expectedEnd", "Expected return"], ["actualStart", "Actual start"], ["actualEnd", "Actual return"]] as const).map(([k, l]) => (
              <label key={k} className="lv-daterow">
                <span>{l}</span>
                <input type="date" className="f" value={c[k] ?? ""} onChange={(e) => upd({ [k]: e.target.value || (k === "requestedAt" ? c.requestedAt : undefined) } as Partial<LeaveCase>)} />
              </label>
            ))}
            {back && back !== c.expectedEnd && <p className="tiny muted">Extended return: {fmtDay(back)}</p>}
            {(c.actualStart || c.expectedStart) && (back || c.actualEnd) && <p className="tiny muted">About {weeksBetween(c.actualStart || c.expectedStart, c.actualEnd || back)} weeks.</p>}
          </div>

          {/* leave types + eligibility */}
          <div className="card section">
            <div className="row" style={{ alignItems: "baseline" }}>
              <h3 className="lv-h grow">Leave types</h3>
              <button className="lv-linkbtn" onClick={() => setEditTypes(!editTypes)}>{editTypes ? "Done" : "Change"}</button>
            </div>
            {editTypes && (
              <>
                <div className="so-values">
                  {cats.map((x) => (
                    <button key={x.id} className={c.categories.includes(x.id) ? "on" : ""} onClick={() => upd({ categories: c.categories.includes(x.id) ? c.categories.filter((y) => y !== x.id) : [...c.categories, x.id] })}>{x.short}</button>
                  ))}
                </div>
                <button
                  className="btn sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    const have = new Set(c.tasks.map((t) => t.key ?? t.title));
                    const add = tasksFor(c, cats).filter((t) => !have.has(t.key ?? t.title));
                    if (!add.length) return toast.show("The checklist already covers these types");
                    upd({ tasks: [...c.tasks, ...add] }, `Added ${add.length} task${add.length === 1 ? "" : "s"}`);
                  }}
                >
                  Add missing checklist items
                </button>
              </>
            )}
            {c.categories.map((cid) => {
              const cat = cats.find((x) => x.id === cid);
              const ent = c.entitlement[cid] ?? {};
              return (
                <div key={cid} className="lv-elig">
                  <b>{cat?.name ?? catName(cid)}</b>
                  {cat?.eligibility && <span className="lv-sub">Check: {cat.eligibility}</span>}
                  {cat?.entitlement && <span className="lv-sub">Typical: {cat.entitlement}</span>}
                  <select className="f" value={c.eligibility[cid] ?? "not_reviewed"} onChange={(e) => upd({ eligibility: { ...c.eligibility, [cid]: e.target.value as Eligibility } })}>
                    {(Object.keys(ELIG) as Eligibility[]).map((k) => <option key={k} value={k}>{ELIG[k]}</option>)}
                  </select>
                  {(cat?.entitlement || ent.available != null) && <div className="lv-ent">
                    <label>Weeks available<input className="f" type="number" min={0} step={0.1} defaultValue={ent.available ?? ""} onBlur={(e) => upd({ entitlement: { ...c.entitlement, [cid]: { ...ent, available: e.target.value === "" ? undefined : Number(e.target.value) } } })} /></label>
                    <label>Weeks used<input className="f" type="number" min={0} step={0.1} defaultValue={ent.used ?? ""} onBlur={(e) => upd({ entitlement: { ...c.entitlement, [cid]: { ...ent, used: e.target.value === "" ? undefined : Number(e.target.value) } } })} /></label>
                  </div>}
                  {ent.available != null && ent.used != null && <span className="lv-sub">{Math.max(0, Math.round((ent.available - ent.used) * 10) / 10)} weeks left</span>}
                </div>
              );
            })}
            <p className="tiny muted">Your review, not a legal determination. Protections can run at the same time.</p>
          </div>

          {/* extensions */}
          <div className="card section">
            <h3 className="lv-h">Extensions</h3>
            {c.extensions.length === 0 && <p className="small muted">None.</p>}
            {c.extensions.map((e) => (
              <div key={e.id} className="lv-ext">
                <span className="grow">To <b>{fmtDay(e.newEnd)}</b><span className="lv-sub">Requested {fmtDay(e.requestedAt)}</span></span>
                {e.status === "requested" ? (
                  <span className="lv-extbtns">
                    <button className="btn sm" onClick={() => upd({ extensions: c.extensions.map((x) => (x.id === e.id ? { ...x, status: "not_approved" } : x)) })}>Not approved</button>
                    <button className="btn sm primary" onClick={() => upd({ extensions: c.extensions.map((x) => (x.id === e.id ? { ...x, status: "approved" } : x)), status: ["active", "approved"].includes(c.status) ? "extended" : c.status })}>Approved</button>
                  </span>
                ) : (
                  <span className={`pill ${e.status === "approved" ? "done" : "later"}`}>{e.status === "approved" ? "Approved" : "Not approved"}</span>
                )}
              </div>
            ))}
            <div className="lv-addrow">
              <input className="f lv-date" type="date" value={ext} min={back || undefined} onChange={(e) => setExt(e.target.value)} aria-label="New return date" />
              <button className="btn sm" disabled={!ext} onClick={async () => { if (await upd({ extensions: [...c.extensions, { id: uid(), requestedAt: today(), newEnd: ext, status: "requested" }], tasks: [...c.tasks, { id: uid(), title: "Get updated certification for the extension (if needed)", kind: "certification", due: addDays(today(), 15), done: false }] }, "Extension request logged")) setExt(""); }}>Log request</button>
            </div>
          </div>

          {/* benefits + accommodation */}
          <div className="card section">
            <h3 className="lv-h">Benefits and accommodation</h3>
            <label className="lv-check"><input type="checkbox" checked={!!c.benefits?.continuing} onChange={(e) => upd({ benefits: { ...c.benefits, continuing: e.target.checked } })} /> Health benefits continuing</label>
            <input className="f" placeholder="How premiums are paid during leave" defaultValue={c.benefits?.premiums ?? ""} onBlur={(e) => e.target.value !== (c.benefits?.premiums ?? "") && upd({ benefits: { ...c.benefits, premiums: e.target.value.trim() || undefined } })} />
            <label className="lv-check" style={{ marginTop: 10 }}><input type="checkbox" checked={!!c.accommodation?.considered} onChange={(e) => upd({ accommodation: { ...c.accommodation, considered: e.target.checked } })} /> Accommodation considered</label>
            <textarea className="f" style={{ minHeight: 60 }} placeholder="What was discussed and decided (work restrictions only)" defaultValue={c.accommodation?.note ?? ""} onBlur={(e) => e.target.value !== (c.accommodation?.note ?? "") && upd({ accommodation: { ...c.accommodation, note: e.target.value.trim() || undefined } })} />
          </div>

          {/* emails */}
          <div className="card section">
            <div className="row" style={{ alignItems: "baseline" }}>
              <h3 className="lv-h grow">Emails</h3>
              <button className="lv-linkbtn" onClick={() => setEmailing(true)}>Write one</button>
            </div>
            {c.emails.length === 0 ? <p className="small muted">None sent yet.</p> : [...c.emails].reverse().map((e, i) => (
              <div key={i} className="lv-kv"><span>{e.subject}<span className="lv-sub">to {e.to}</span></span><span className="tiny muted">{fmtDay(e.at.slice(0, 10))}</span></div>
            ))}
          </div>

          {/* history */}
          <div className="card section">
            <h3 className="lv-h">History</h3>
            {!hist ? (
              <button className="btn sm" onClick={loadHist}>Show history</button>
            ) : hist.length === 0 ? (
              <p className="small muted">Nothing yet.</p>
            ) : (
              <div className="lv-hist">
                {hist.slice(0, 60).map((h, i) => (
                  <div key={i}>
                    <span className="tiny muted">{new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    <span className="small"><b>{h.who}</b> {h.what}{h.detail ? <span className="muted">: {h.detail}</span> : null}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
      <p className="tiny muted lv-legal">{NOT_LEGAL}</p>
      {emailing && (
        <EmailSheet
          c={c}
          company={client.name}
          me={meP}
          onClose={() => setEmailing(false)}
          onSend={async (b) => {
            if (!LIVE) {
              replace({ ...c, emails: [...c.emails, { at: new Date().toISOString(), by: meP.name, to: b.to, subject: b.subject }] });
              setEmailing(false);
              setHist(null);
              toast.show("Sent (demo)");
              return "";
            }
            const j = await leaveApi(clientId, { action: "email", caseId: c.id, ...b });
            if (!j.ok) return j.reason === "recipient" ? "Case emails can only go to the employee, their manager or HR admins." : "Couldn't send it. Try again.";
            replace(j.case);
            setEmailing(false);
            setHist(null);
            toast.show("Sent");
            return "";
          }}
        />
      )}
    </>
  );
}
