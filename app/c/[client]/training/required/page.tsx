"use client";

// Required training: HR and executives see who's covered, check certificates, answer questions and set up
// courses. Managers see their own team. Employees use their private link (/training/<token>).
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import {
  ComplianceSettings, Course, CRD_PAGE, fmtDate, Stage, stageOf, STAGE_LABEL, TrainingRecord, variantLabel, Variant,
} from "@/lib/compliance";
import { ListData, trainingApi } from "@/lib/complianceclient";

type Tab = "overview" | "certificates" | "questions" | "setup";
const TONE: Record<Stage, string> = { current: "green", due_soon: "gold", late: "red", checking: "blue", sent_back: "gold", assigned: "", new_hire: "" };
const Chip = ({ st, extra }: { st: Stage; extra?: string }) => <span className={`pf-chip ${TONE[st]}`}>{STAGE_LABEL[st].en}{extra ? ` · ${extra}` : ""}</span>;

export default function RequiredTraining() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, people, viewer, me } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const toast = useToast();
  const [data, setData] = useState<ListData | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const demo = useMemo(() => ({ people, me: { email: viewer?.kind === "client" ? (me?.email ?? "") : "ben@alzapc.com", admin: viewer?.kind === "advisor" || me?.access === "exec" } }), [people, viewer, me]);
  const call = useCallback((body: Record<string, unknown>) => trainingApi(clientId, body, demo), [clientId, demo]);
  const load = useCallback(async () => {
    const r = await call({ action: "list" });
    if (r.ok) setData(r as ListData);
    else setErr(r.reason === "off" ? "off" : r.reason === "setup" ? "setup" : "load");
  }, [call]);
  useEffect(() => {
    if (!ok) return;
    load();
    const q = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (q) setTab(q);
  }, [ok]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!cfg?.modules.compliance) return shell(<div className="card section small muted">Required training isn&apos;t turned on for {client.name}.</div>);
  if (err) return shell(<div className="card section small muted">{err === "off" ? "Required training isn't turned on." : err === "setup" ? "Almost ready. The database update for required training (supabase/021_compliance.sql) hasn't been run yet. Run it once in Supabase, then refresh." : "Couldn't load required training. Try again in a moment."}</div>);
  if (!data) return shell(<p className="small muted">Loading…</p>);

  if (!data.role.admin) return shell(<ManagerView data={data} call={call} toast={toast.show} />);
  const checking = data.records.filter((r) => r.status === "submitted");
  const questions = data.records.filter((r) => r.questions.some((q) => !q.answer));
  return shell(
    <>
      <div className="tr-head">
        <div>
          <h1 className="pf-h" style={{ margin: 0 }}>Required training</h1>
          <p className="muted pf-p" style={{ margin: "4px 0 0" }}>California requirements and anything else you track. We assign it, collect the proof and remind people.</p>
        </div>
      </div>
      {!data.settings.live && <LaunchBar data={data} call={call} onDone={(m) => { toast.show(m); load(); }} />}
      <div className="pf-filters section" role="tablist" aria-label="Sections">
        {([["overview", "Overview"], ["certificates", `Certificates${checking.length ? ` (${checking.length})` : ""}`], ["questions", `Questions${questions.length ? ` (${questions.length})` : ""}`], ["setup", "Courses and settings"]] as const).map(([k, lb]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{lb}</button>
        ))}
      </div>
      {tab === "overview" && <Overview data={data} call={call} toast={toast.show} reload={load} go={setTab} />}
      {tab === "certificates" && <Certificates data={data} call={call} toast={toast.show} reload={load} />}
      {tab === "questions" && <Questions data={data} call={call} toast={toast.show} reload={load} />}
      {tab === "setup" && <Setup data={data} clientId={clientId} call={call} toast={toast.show} reload={load} />}
    </>,
  );
}

type Call = (b: Record<string, unknown>) => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Props = { data: ListData; call: Call; toast: (m: string) => void; reload: () => void };

/** The latest record per person per course: open if there is one, else the newest finished. */
function latestBy(records: TrainingRecord[]) {
  const m = new Map<string, TrainingRecord>();
  const rank = (r: TrainingRecord) => (["assigned", "sentback", "submitted"].includes(r.status) ? 2 : 1);
  for (const r of records) {
    const k = `${r.personId}|${r.courseId}`;
    const cur = m.get(k);
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && (r.completedAt ?? r.due) > (cur.completedAt ?? cur.due))) m.set(k, r);
  }
  return m;
}

function LaunchBar({ data, call, onDone }: { data: ListData; call: Call; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const people = new Set(data.records.filter((r) => r.status === "assigned" && !r.sentAt).map((r) => r.personId)).size;
  const noEmail = data.people.filter((p) => !p.hasEmail).length;
  return (
    <div className="pf-launch section">
      <div className="grow">
        <b>Ready when you are</b>
        <span className="tiny muted">Nothing has been emailed yet. Launch sends {people} {people === 1 ? "person" : "people"} their assignments, then reminders run on their own.{noEmail ? ` ${noEmail} without an email: copy their link from Overview.` : ""}</span>
      </div>
      <button className="btn primary sm" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await call({ action: "launch" });
        setBusy(false);
        onDone(r.ok ? `Launched. ${r.sent ?? 0} ${r.sent === 1 ? "person" : "people"} emailed.` : "Couldn't launch. Try again.");
      }}>{busy ? "Launching…" : "Launch"}</button>
    </div>
  );
}

// ---------- overview ----------
function Overview({ data, call, toast, reload, go }: Props & { go: (t: Tab) => void }) {
  const today = data.today;
  const courses = data.settings.courses.filter((c) => c.on);
  const latest = useMemo(() => latestBy(data.records), [data.records]);
  const [filter, setFilter] = useState<"all" | "late" | "soon" | "new" | "sup">("all");
  const [recording, setRecording] = useState(false);
  const stOf = (pid: string, cid: string) => { const r = latest.get(`${pid}|${cid}`); return r ? { r, st: stageOf(r, today) } : null; };
  const attention = data.records
    .filter((r) => ["assigned", "sentback", "submitted"].includes(r.status))
    .map((r) => ({ r, st: stageOf(r, today) }))
    .filter(({ st }) => st === "late" || st === "checking" || st === "sent_back")
    .sort((a, b) => (a.st === "late" ? -1 : b.st === "late" ? 1 : a.r.due < b.r.due ? -1 : 1));
  const people = data.people.filter((p) => {
    const sts = courses.map((c) => stOf(p.id, c.id)?.st);
    if (filter === "late") return sts.includes("late");
    if (filter === "soon") return sts.includes("due_soon");
    if (filter === "new") return sts.includes("new_hire");
    if (filter === "sup") return p.sup;
    return true;
  });
  const exportCsv = () => {
    const rows = [["Name", "Title", "Course", "Version", "Status", "Due", "Completed", "Approved by", "Certificate on file"]];
    for (const r of [...data.records].sort((a, b) => a.name.localeCompare(b.name))) rows.push([r.name, r.title ?? "", r.courseName, r.variant ? variantLabel(r.variant) : "", STAGE_LABEL[stageOf(r, today)].en, r.due, r.completedAt ?? "", r.approvedBy ?? "", r.file ? "Yes" : r.status === "approved" ? "Sign-off" : ""]);
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Required training ${today}.csv`;
    a.click();
  };
  const copyLink = async (personId: string) => {
    const r = await call({ action: "link", personId });
    if (!r.ok) return toast("No link yet. It's created with their first assignment.");
    try { await navigator.clipboard.writeText(r.url); toast("Link copied. Text it or print it for them."); } catch { toast(r.url); }
  };
  return (
    <>
      <div className="tr-courses section">
        {courses.map((c) => {
          const rs = data.people.map((p) => stOf(p.id, c.id)).filter(Boolean) as { r: TrainingRecord; st: Stage }[];
          const n = (st: Stage) => rs.filter((x) => x.st === st).length;
          const pct = rs.length ? Math.round((n("current") / rs.length) * 100) : 0;
          return (
            <section key={c.id} className="card tr-course">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div><b>{c.name}</b><div className="tiny muted">{c.kind === "crd" ? "Every 2 years · CRD course" : `${c.everyMonths ? `Every ${c.everyMonths === 12 ? "year" : `${c.everyMonths} months`}` : "Once"} · ${c.proof === "signoff" ? "sign-off" : "certificate"}`}</div></div>
                <span className="tr-pct">{pct}%</span>
              </div>
              <span className="pf-bar" style={{ width: "100%" }}><span style={{ width: `${pct}%` }} /></span>
              <div className="tr-counts tiny muted">
                <span><b>{n("current")}</b>Current</span>
                <span><b className="gold">{n("due_soon")}</b>Due in 60 days</span>
                <span><b className="red">{n("late")}</b>Late</span>
                <span><b>{n("new_hire") + n("assigned")}</b>Assigned</span>
              </div>
            </section>
          );
        })}
        {!courses.length && <div className="card small muted">No courses are on. Turn them on in Courses and settings.</div>}
      </div>

      <section className="card section">
        <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 className="pf-h2" style={{ margin: 0 }}>Needs attention</h2>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => setRecording(true)}>Record a completion</button>
            <button className="btn sm" onClick={exportCsv}>Export for audit</button>
          </div>
        </div>
        {!attention.length && <p className="small muted" style={{ margin: "10px 0 0" }}>Nothing late or waiting on you.</p>}
        {attention.map(({ r, st }) => (
          <div key={r.id} className="tr-row">
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="small">{r.name}</b>
              <div className="tiny muted">{r.courseName}{r.variant ? ` (${variantLabel(r.variant)})` : ""} · {st === "checking" ? `uploaded ${fmtDate(r.submittedAt)}` : `due ${fmtDate(r.due)}`}</div>
            </div>
            <Chip st={st} extra={st === "late" ? `${Math.max(1, Math.round((Date.parse(today) - Date.parse(r.due)) / 864e5))} days` : undefined} />
            {st === "checking" ? <button className="btn sm" onClick={() => go("certificates")}>Check</button> : (
              <button className="btn sm" onClick={async () => { const x = await call({ action: "remind", id: r.id }); toast(x.ok ? `Reminder sent to ${r.name.split(" ")[0]}` : x.reason === "no_email" ? "No email on file. Copy their link instead." : "Couldn't send."); }}>Remind</button>
            )}
          </div>
        ))}
      </section>

      <section className="card section">
        <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 className="pf-h2" style={{ margin: 0 }}>Everyone</h2>
          <div className="pf-filters" role="group" aria-label="Filter">
            {([["all", `All ${data.people.length}`], ["late", "Late"], ["soon", "Due soon"], ["new", "New hires"], ["sup", "Supervisors"]] as const).map(([k, lb]) => <button key={k} className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{lb}</button>)}
          </div>
        </div>
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead><tr><th>Name</th>{courses.map((c) => <th key={c.id}>{c.name}</th>)}<th aria-label="Actions" /></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="tiny muted">{p.title}{p.sup ? " · supervisor" : ""}{!p.hasEmail ? " · no email" : ""}</div></td>
                  {courses.map((c) => {
                    const x = stOf(p.id, c.id);
                    return <td key={c.id}>{x ? <><Chip st={x.st} /><div className="tiny muted" style={{ marginTop: 3 }}>{x.st === "current" ? `Done ${fmtDate(x.r.completedAt)}` : `Due ${fmtDate(x.r.due)}`}</div></> : <span className="tiny muted">Doesn&apos;t apply</span>}</td>;
                  })}
                  <td style={{ textAlign: "right" }}><button className="linklike tiny" onClick={() => copyLink(p.id)}>Copy link</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ margin: "10px 0 0" }}>Records stay after someone leaves. The export lists every assignment, completion date and how it was proven.</p>
      </section>
      {recording && <RecordSheet data={data} call={call} onClose={() => setRecording(false)} onDone={(m) => { setRecording(false); toast(m); reload(); }} />}
    </>
  );
}

function RecordSheet({ data, call, onClose, onDone }: { data: ListData; call: Call; onClose: () => void; onDone: (m: string) => void }) {
  const courses = data.settings.courses.filter((c) => c.on);
  const [personId, setPersonId] = useState(data.people[0]?.id ?? "");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [date, setDate] = useState(data.today);
  const [variant, setVariant] = useState<Variant>(data.people[0]?.sup ? "supervisor" : "employee");
  const [busy, setBusy] = useState(false);
  const c = courses.find((y) => y.id === courseId);
  return (
    <Sheet title="Record a completion" onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>For training done somewhere else, like a live session or a paper certificate.</p>
      <label className="f">Person<select className="f" value={personId} onChange={(e) => { setPersonId(e.target.value); setVariant(data.people.find((p) => p.id === e.target.value)?.sup ? "supervisor" : "employee"); }}>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="f">Course<select className="f" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      {c?.kind === "crd" && <label className="f">Version<select className="f" value={variant} onChange={(e) => setVariant(e.target.value as Variant)}><option value="supervisor">Supervisor, 2 hours</option><option value="employee">Employee, 1 hour</option></select></label>}
      <label className="f">Completed on<input className="f" type="date" value={date} max={data.today} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !personId || !courseId} onClick={async () => {
        setBusy(true);
        const r = await call({ action: "record", personId, courseId, date, variant });
        setBusy(false);
        onDone(r.ok ? "Saved to their record." : "Couldn't save. Try again.");
      }}>{busy ? "Saving…" : "Save"}</button>
    </Sheet>
  );
}

// ---------- certificates ----------
function Certificates({ data, call, toast, reload }: Props) {
  const queue = data.records.filter((r) => r.status === "submitted").sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? -1 : 1));
  const [sel, setSel] = useState(queue[0]?.id ?? "");
  const r = queue.find((x) => x.id === sel) ?? queue[0];
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDate(r?.ai?.date || r?.submittedAt?.slice(0, 10) || data.today); setBack(false); setNote(r?.ai?.flags?.[0] ? `${r.ai.flags[0]} Please upload it again.` : ""); }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <div className="card section small muted">No certificates waiting. Clean ones are approved automatically{data.settings.autoApprove ? "" : " once you turn that on"}; anything we can&apos;t confirm lands here.</div>;
  const ai = r.ai;
  const checks = [
    { label: "Name", ok: !!ai?.name && !(ai.flags ?? []).some((f) => f.startsWith("Name")), text: ai?.name ? `${ai.name}${(ai.flags ?? []).some((f) => f.startsWith("Name")) ? `. Roster says ${r.name}.` : ". Matches the roster."}` : "Couldn't read a name." },
    { label: "Course", ok: !(ai?.flags ?? []).some((f) => f.includes("course")), text: `${ai?.course ? `${ai.course.replace(/\.$/, "")}.` : "Couldn't read the course."}${r.variant ? ` Needed: ${variantLabel(r.variant)}.` : ""}` },
    { label: "Completed", ok: !!ai?.date && !(ai.flags ?? []).some((f) => f.includes("date")), text: ai?.date ? fmtDate(ai.date) : "Couldn't read a date." },
  ];
  const other = (ai?.flags ?? []).filter((f) => !f.startsWith("Name") && !f.includes("course") && !f.includes("date"));
  const openFile = async () => { const x = await call({ action: "file", id: r.id }); if (x.ok) window.open(x.url, "_blank", "noopener"); else toast(x.reason === "demo" ? "Files don't open in the demo." : "Couldn't open the file."); };
  return (
    <div className="tr-check section">
      <div className="tr-queue">
        {queue.map((q) => (
          <button key={q.id} className={`tr-q ${q.id === r.id ? "on" : ""}`} onClick={() => setSel(q.id)}>
            <b className="small">{q.name}</b>
            <span className="tiny muted">{q.courseName}{q.variant ? ` (${variantLabel(q.variant)})` : ""}</span>
            <span className={`pf-chip ${(q.ai?.flags ?? []).length ? "gold" : "blue"}`}>{(q.ai?.flags ?? []).length ? "Look closer" : "Looks right"}</span>
          </button>
        ))}
      </div>
      <section className="card tr-detail">
        <div className="tr-file">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>
          <b className="small">{r.file?.name ?? "certificate"}</b>
          <span className="tiny muted">Uploaded {fmtDate(r.submittedAt)}</span>
          <button className="btn sm" onClick={openFile}>Open it</button>
        </div>
        <div className="tr-read">
          <h2 className="pf-h2" style={{ margin: 0 }}>{r.name}</h2>
          <span className="tiny muted">What we read from the certificate</span>
          {checks.map((c) => (
            <div key={c.label} className={`tr-checkrow ${c.ok ? "ok" : "flag"}`}>
              <span aria-hidden="true">{c.ok ? "✓" : "!"}</span>
              <div><b className="small">{c.label}</b><div className="small">{c.text}</div></div>
            </div>
          ))}
          {other.map((f) => <div key={f} className="tr-checkrow flag"><span aria-hidden="true">!</span><div className="small">{f}</div></div>)}
          <span className="tiny muted">{r.attest ? `They checked "I completed this training myself."` : ""}</span>
          {back ? (
            <>
              <label className="f">What should they fix?<textarea className="f" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const x = await call({ action: "sendback", id: r.id, note }); setBusy(false); toast(x.ok ? `Sent back to ${r.name.split(" ")[0]}` : "Couldn't send."); reload(); }}>Send it back</button>
                <button className="btn" onClick={() => setBack(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <label className="f" style={{ maxWidth: 220 }}>Completed on<input className="f" type="date" value={date} max={data.today} onChange={(e) => setDate(e.target.value)} /></label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy || !date} onClick={async () => { setBusy(true); const x = await call({ action: "approve", id: r.id, date }); setBusy(false); toast(x.ok ? "Approved and saved to their record." : "Couldn't approve."); reload(); }}>Approve</button>
                <button className="btn" onClick={() => setBack(true)}>Send back</button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------- questions ----------
function Questions({ data, call, toast, reload }: Props) {
  const list = data.records.flatMap((r) => r.questions.map((q) => ({ r, q }))).sort((a, b) => (!!a.q.answer === !!b.q.answer ? (a.q.at < b.q.at ? 1 : -1) : a.q.answer ? 1 : -1));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!list.length) return <div className="card section small muted">No questions yet. People can ask about your plan during workplace violence training, and you&apos;ll get an email.</div>;
  return (
    <div className="section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map(({ r, q }) => (
        <section key={q.id} className="card">
          <div className="tiny muted">{r.name} · {r.courseName} · {fmtDate(q.at)}</div>
          <p className="small" style={{ margin: "6px 0 10px" }}><b>&ldquo;{q.q}&rdquo;</b></p>
          {q.answer ? <p className="small" style={{ margin: 0 }}><span className="muted">Your answer:</span> {q.answer}</p> : (
            <>
              <textarea className="f" rows={3} placeholder="Your answer. They'll get it by email." value={drafts[q.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} />
              <button className="btn primary sm" style={{ marginTop: 8 }} disabled={!(drafts[q.id] ?? "").trim()} onClick={async () => { const x = await call({ action: "answer", id: r.id, qid: q.id, text: drafts[q.id] }); toast(x.ok ? "Answer sent." : "Couldn't send."); reload(); }}>Send answer</button>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------- setup ----------
function Setup({ data, clientId, call, toast, reload }: Props & { clientId: string }) {
  const [s, setS] = useState<ComplianceSettings>(data.settings);
  const [editing, setEditing] = useState<Course | null>(null);
  const [admins, setAdmins] = useState(data.settings.admins.join(", "));
  const save = async (next: ComplianceSettings, msg = "Saved") => {
    setS(next);
    const r = await call({ action: "settings", settings: next });
    toast(r.ok ? msg : "Couldn't save. Try again.");
    if (r.ok) { setS(r.settings); reload(); }
  };
  const setCourse = (c: Course) => save({ ...s, courses: s.courses.some((x) => x.id === c.id) ? s.courses.map((x) => (x.id === c.id ? c : x)) : [...s.courses, c] });
  return (
    <>
      <div className="tr-setup section">
        {s.courses.map((c) => (
          <section key={c.id} className="card tr-course">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <b>{c.name}</b>
                <div className="tiny muted">{c.about}</div>
              </div>
              <button className={`tr-switch ${c.on ? "on" : ""}`} role="switch" aria-checked={c.on} aria-label={`${c.name} on or off`} onClick={() => setCourse({ ...c, on: !c.on })}><span /></button>
            </div>
            <dl className="tr-dl">
              <div><dt>How often</dt><dd>{c.kind === "crd" ? "Every 2 years" : c.everyMonths ? (c.everyMonths === 12 ? "Every year" : `Every ${c.everyMonths} months`) : "Once"}</dd></div>
              <div><dt>Who</dt><dd>{c.kind === "crd" ? "Everyone (supervisors 2 hrs, others 1 hr)" : c.who === "all" ? "Everyone" : c.who === "supervisors" ? "Supervisors" : "Non-supervisors"}</dd></div>
              <div><dt>New hires</dt><dd>Within {c.newHireDays} days</dd></div>
              <div><dt>Proof</dt><dd>{c.proof === "signoff" ? "Sign-off" : "Certificate upload"}</dd></div>
              {c.kind === "plan" && <div><dt>Your plan</dt><dd>{c.planName || <span className="red">Not uploaded yet</span>}</dd></div>}
              {c.kind === "crd" && <div><dt>Course</dt><dd><a href={CRD_PAGE} target="_blank" rel="noopener noreferrer">CRD, free, 6 languages</a></dd></div>}
              {c.kind === "custom" && c.link && <div><dt>Course</dt><dd><a href={c.link} target="_blank" rel="noopener noreferrer">Open link</a></dd></div>}
            </dl>
            <button className="btn sm" onClick={() => setEditing(c)}>Edit</button>
          </section>
        ))}
        <button className="tr-add" onClick={() => setEditing({ id: "", kind: "custom", name: "", about: "", on: true, who: "all", everyMonths: 12, newHireDays: 30, proof: "certificate", link: "" })}>+ Add a course<span className="tiny muted">Forklift, food handler, CPR, anything with a certificate or a sign-off</span></button>
      </div>

      <section className="card section tr-settings">
        <div>
          <b>Reminders</b>
          <div className="pf-filters" role="group" aria-label="Reminder days" style={{ marginTop: 8 }}>
            {[90, 60, 30, 14, 7].map((n) => <button key={n} className={s.remind.includes(n) ? "on" : ""} aria-pressed={s.remind.includes(n)} onClick={() => save({ ...s, remind: s.remind.includes(n) ? s.remind.filter((x) => x !== n) : [...s.remind, n] })}>{n} days</button>)}
          </div>
          <label className="row small" style={{ gap: 8, marginTop: 10 }}><input type="checkbox" checked={s.overdueWeekly} onChange={(e) => save({ ...s, overdueWeekly: e.target.checked })} /> Weekly when late, with a copy to their manager and HR</label>
        </div>
        <div>
          <b>Certificates</b>
          <label className="row small" style={{ gap: 8, marginTop: 8, alignItems: "flex-start" }}><input type="checkbox" checked={s.autoApprove} onChange={(e) => save({ ...s, autoApprove: e.target.checked })} style={{ marginTop: 3 }} /> <span>Approve clean ones automatically (name, course and date all check out). Anything off waits for HR.</span></label>
        </div>
        <div>
          <b>People already here</b>
          <label className="f small" style={{ marginTop: 8, maxWidth: 260 }}>Days to finish after you launch<input className="f" type="number" min={7} max={365} value={s.catchUpDays} onChange={(e) => setS({ ...s, catchUpDays: Number(e.target.value) })} onBlur={() => save(s)} /></label>
        </div>
        <div>
          <b>Who checks certificates and answers questions</b>
          <p className="tiny muted" style={{ margin: "4px 0 8px" }}>Executives and HR can always. Add HR people by email; questions go to them (or to Alza HR if nobody is listed).</p>
          <input className="f" value={admins} onChange={(e) => setAdmins(e.target.value)} onBlur={() => save({ ...s, admins: admins.split(/[,\s]+/).filter(Boolean) })} placeholder="hr@company.com" />
        </div>
        <div>
          <b>Supervisors</b>
          <p className="tiny muted" style={{ margin: "4px 0 8px" }}>Anyone with direct reports on the roster: {data.people.filter((p) => p.sup).length} today. Someone new to supervising gets 6 months for the 2-hour course.</p>
          <details>
            <summary className="small" style={{ cursor: "pointer" }}>Adjust by hand</summary>
            <div className="tr-sups">
              {data.people.map((p) => (
                <label key={p.id} className="row small" style={{ gap: 8 }}>
                  <input type="checkbox" checked={p.sup} onChange={(e) => save({ ...s, supAdd: e.target.checked ? [...s.supAdd.filter((x) => x !== p.id), p.id] : s.supAdd.filter((x) => x !== p.id), supRemove: e.target.checked ? s.supRemove.filter((x) => x !== p.id) : [...s.supRemove.filter((x) => x !== p.id), p.id] }, `${p.name} ${e.target.checked ? "is" : "isn't"} a supervisor now`)} />
                  {p.name}
                </label>
              ))}
            </div>
          </details>
        </div>
        <div>
          <b>Emails</b>
          <p className="small" style={{ margin: "4px 0 0" }}>{s.live ? "On. New assignments and reminders go out automatically." : "Off until you press Launch."} {s.live && <button className="linklike small" onClick={() => save({ ...s, live: false }, "Paused. No training emails will go out.")}>Pause</button>}</p>
        </div>
      </section>
      {editing && <CourseSheet c={editing} clientId={clientId} call={call} toast={toast} onClose={() => setEditing(null)} onSave={(c) => { setEditing(null); setCourse(c); }} />}
    </>
  );
}

function CourseSheet({ c, clientId, call, toast, onClose, onSave }: { c: Course; clientId: string; call: Call; toast: (m: string) => void; onClose: () => void; onSave: (c: Course) => void }) {
  const [d, setD] = useState<Course>(c);
  const [uploading, setUploading] = useState(false);
  const up = (p: Partial<Course>) => setD({ ...d, ...p });
  const isNew = !c.id;
  const uploadPlan = async (f: File) => {
    if (!d.id) return toast("Save the course first, then add the plan.");
    setUploading(true);
    const r = await call({ action: "planUpload", courseId: d.id, name: f.name, mime: f.type });
    if (!r.ok) { setUploading(false); return toast(r.reason === "demo" ? "Uploads are off in the demo." : "Couldn't upload. Use a PDF, Word file or image."); }
    const put = await fetch(r.url, { method: "PUT", headers: { "Content-Type": f.type }, body: f }).catch(() => null);
    setUploading(false);
    if (!put?.ok) return toast("Upload failed. Try again.");
    up({ planPath: r.path, planName: f.name });
    toast("Plan uploaded. Save to keep it.");
  };
  void clientId;
  return (
    <Sheet title={isNew ? "Add a course" : `Edit ${c.name}`} onClose={onClose}>
      <label className="f">Name<input className="f" value={d.name} disabled={d.kind === "crd"} onChange={(e) => up({ name: e.target.value })} placeholder="Forklift safety" /></label>
      <label className="f">What it&apos;s for<textarea className="f" rows={2} value={d.about} onChange={(e) => up({ about: e.target.value })} placeholder="Shown to employees on their training page" /></label>
      {d.kind === "custom" && <label className="f">Course link<input className="f" value={d.link ?? ""} onChange={(e) => up({ link: e.target.value })} placeholder="https://" /></label>}
      {d.kind !== "crd" && (
        <div className="tr-grid2">
          <label className="f">How often<select className="f" value={d.everyMonths} onChange={(e) => up({ everyMonths: Number(e.target.value) })}><option value={12}>Every year</option><option value={24}>Every 2 years</option><option value={36}>Every 3 years</option><option value={6}>Every 6 months</option><option value={0}>Once</option></select></label>
          <label className="f">Who<select className="f" value={d.who} onChange={(e) => up({ who: e.target.value as Course["who"] })}><option value="all">Everyone</option><option value="supervisors">Supervisors</option><option value="employees">Non-supervisors</option></select></label>
          <label className="f">New hires finish within<select className="f" value={d.newHireDays} onChange={(e) => up({ newHireDays: Number(e.target.value) })}>{[7, 14, 30, 60, 90, 180].map((n) => <option key={n} value={n}>{n} days</option>)}</select></label>
          <label className="f">Proof<select className="f" value={d.proof} onChange={(e) => up({ proof: e.target.value as Course["proof"] })}><option value="certificate">Upload a certificate</option><option value="signoff">Sign-off</option></select></label>
        </div>
      )}
      {d.kind === "crd" && <p className="small muted">The state&apos;s free course. Supervisors get the 2-hour version and everyone else the 1-hour version, in English, Spanish, Chinese, Korean, Vietnamese or Tagalog. New hires and new supervisors have 6 months.</p>}
      {d.kind === "plan" && (
        <>
          <div className="f">
            <span>Your prevention plan</span>
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="small">{d.planName || "No file yet"}</span>
              <label className="btn sm" style={{ cursor: "pointer" }}>{uploading ? "Uploading…" : d.planName ? "Replace" : "Upload"}<input type="file" accept=".pdf,.docx,image/*" hidden onChange={(e) => e.target.files?.[0] && uploadPlan(e.target.files[0])} /></label>
            </div>
            <span className="tiny muted">HR can write this for you.</span>
          </div>
          <label className="f">Training video link (optional)<input className="f" value={d.videoUrl ?? ""} onChange={(e) => up({ videoUrl: e.target.value })} placeholder="https://" /></label>
          <label className="f">Live Q&amp;A (optional)<input className="f" value={d.qa ?? ""} onChange={(e) => up({ qa: e.target.value })} placeholder="Thursday, Jan 8 at 12:00 on Zoom" /></label>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={d.questions !== false} onChange={(e) => up({ questions: e.target.checked })} /> Let people send a question to HR during the training</label>
        </>
      )}
      <button className="btn primary block" style={{ marginTop: 14 }} disabled={!d.name.trim()} onClick={() => onSave({ ...d, on: isNew ? true : d.on })}>{isNew ? "Add course" : "Save"}</button>
    </Sheet>
  );
}

// ---------- managers: their team only ----------
function ManagerView({ data, call, toast }: { data: ListData; call: Call; toast: (m: string) => void }) {
  const courses = data.settings.courses.filter((c) => c.on);
  const latest = latestBy(data.records);
  const late = data.records.filter((r) => ["assigned", "sentback"].includes(r.status) && stageOf(r, data.today) === "late");
  return (
    <>
      <h1 className="pf-h" style={{ margin: 0 }}>Your team&apos;s required training</h1>
      <p className="muted pf-p" style={{ margin: "4px 0 0" }}>{data.people.length} {data.people.length === 1 ? "person" : "people"}. {late.length ? `${late.length} late.` : "Nobody is late."} HR handles the certificates.</p>
      {late.map((r) => (
        <section key={r.id} className="card section tr-row" style={{ borderTop: 0 }}>
          <span className="tr-alert" aria-hidden="true">!</span>
          <div className="grow" style={{ minWidth: 0 }}><b className="small">{r.name.split(" ")[0]} is late on {r.courseName}</b><div className="tiny muted">Was due {fmtDate(r.due)}. We&apos;ve been emailing them.</div></div>
          <button className="btn primary sm" onClick={async () => { const x = await call({ action: "remind", id: r.id }); toast(x.ok ? "Nudge sent." : "Couldn't send. Mention it in person."); }}>Nudge {r.name.split(" ")[0]}</button>
        </section>
      ))}
      <section className="card section">
        {data.people.map((p) => (
          <div key={p.id} className="tr-row">
            <div className="grow" style={{ minWidth: 0 }}><b className="small">{p.name}</b><div className="tiny muted">{p.title}</div></div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {courses.map((c) => { const r = latest.get(`${p.id}|${c.id}`); if (!r) return null; const st = stageOf(r, data.today); return <span key={c.id} className={`pf-chip ${TONE[st]}`}>{c.name.split(" ")[0]} · {st === "current" ? "done" : st === "late" ? "late" : `due ${fmtDate(r.due)}`}</span>; })}
            </div>
          </div>
        ))}
        {!data.people.length && <p className="small muted" style={{ margin: 0 }}>No one reports to you on the roster.</p>}
      </section>
      <p className="tiny muted section">You see dates and status only. Certificates stay with HR.</p>
    </>
  );
}
