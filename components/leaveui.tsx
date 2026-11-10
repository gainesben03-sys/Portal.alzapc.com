"use client";

// Leave center pieces shared by the dashboard tile, the leave pages and the case page.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui";
import { useStore } from "@/lib/store";
import { categoriesFor, CaseDoc, dashboard, fillLeave, fmtDay, LEAVE_EMAILS, LEAVE_FILL_INS, LeaveCase, LeaveCategory, LeaveStatus, newCase, Schedule, SCHEDULE_LABEL, STATUS_LABEL, tasksFor, today } from "@/lib/leave";
import { useLeaveAccess, useLeaveCases } from "@/lib/leaveclient";
import type { HrAdmin } from "@/lib/leaveclient";

export const NOT_LEGAL = "This helps you track deadlines and paperwork. It doesn't approve or deny leave or decide what the law requires. HR makes those calls, with Ben or counsel when it's unclear.";

const TONE: Record<LeaveStatus, string> = { requested: "soon", pending_docs: "today", approved: "alza", active: "alza", extended: "today", returned: "done", closed: "later", denied: "later", withdrawn: "later" };
export function StatusPill({ s }: { s: LeaveStatus }) {
  return <span className={`pill ${TONE[s]}`}>{STATUS_LABEL[s]}</span>;
}

export function dueLabel(days: number) {
  if (days < -1) return `${-days} days late`;
  if (days === -1) return "1 day late";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** People who can own a case: Ben and the client's HR admins. */
export function useAssignees(clientId: string, admins: HrAdmin[]) {
  const { config } = useStore();
  const users = config[clientId]?.users ?? [];
  return useMemo(() => [{ name: "Ben Gaines", email: "ben@alzapc.com" }, ...admins.map((a) => ({ email: a.email, name: users.find((u) => u.email.toLowerCase() === a.email)?.name ?? a.email }))], [admins, users]);
}

/** Home dashboard tile: HR admins only. */
export function LeaveTile({ clientId, Tile }: { clientId: string; Tile: (p: { title: string; count?: React.ReactNode; href?: string; linkLabel?: string; wide?: boolean; children: React.ReactNode }) => React.ReactElement }) {
  const acc = useLeaveAccess(clientId);
  const { config } = useStore();
  const { cases } = useLeaveCases(clientId, acc.admin);
  if (!acc.ready || !acc.admin) return null;
  const d = dashboard(cases ?? [], config[clientId]?.leave);
  const base = `/c/${clientId}/leave`;
  const out = (cases ?? []).filter((c) => ["active", "extended"].includes(c.status));
  return (
    <Tile title="Leave of absence" count={d.active} href={base} linkLabel="Leave center" wide>
      {!cases ? (
        <p className="small muted">Loading…</p>
      ) : (
        <>
          <div className="lv-mini">
            <span><b>{d.active}</b> on leave</span>
            <span><b>{d.pending}</b> new requests</span>
            <span className={d.overdue.length ? "bad" : ""}><b>{d.overdue.length}</b> overdue</span>
          </div>
          {out.length === 0 && d.returning.length === 0 && d.overdue.length === 0 && <p className="small muted">Nobody is out right now.</p>}
          {[...d.overdue.slice(0, 2), ...d.returning.slice(0, 3)].map((x) => (
            <Link key={x.caseId + x.title + x.due} href={`${base}/${x.caseId}`} className="lv-line">
              <span className="grow">
                <b>{x.who}</b> <span className="muted">· {x.kind === "return" ? `back ${fmtDay(x.due)}` : x.title}</span>
              </span>
              <span className={`pill ${x.days < 0 ? "overdue" : x.days <= 3 ? "soon" : "later"}`}>{dueLabel(x.days)}</span>
            </Link>
          ))}
        </>
      )}
    </Tile>
  );
}

type Roster = { id: string; name: string; title: string; email?: string; department?: string; managerName: string; managerEmail: string; active: boolean };

/** Open a new case. Starts the task list from the leave types. */
export function NewCaseSheet({ clientId, roster, cats, assignees, me, nextNumber, onClose, onCreate }: { clientId: string; roster: Roster[]; cats: LeaveCategory[]; assignees: { name: string; email: string }[]; me: { name: string; email: string }; nextNumber: number; onClose: () => void; onCreate: (c: LeaveCase) => Promise<string> }) {
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<Roster | null>(null);
  const [name, setName] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Schedule>("continuous");
  const [scheduleNote, setScheduleNote] = useState("");
  const [req, setReq] = useState(today());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [owner, setOwner] = useState(assignees.find((a) => a.email === me.email)?.email ?? assignees[0]?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hits = q.trim().length >= 1 ? roster.filter((p) => p.active && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const go = async () => {
    const nm = person?.name ?? name.trim();
    if (!nm) return setErr("Pick the employee, or type their name.");
    if (!types.length) return setErr("Pick at least one leave type. You can change it later.");
    setBusy(true);
    const base = newCase(clientId, nextNumber, assignees.find((a) => a.email === owner) ?? me);
    const c: LeaveCase = {
      ...base,
      employee: person ? { personId: person.id, name: person.name, title: person.title, department: person.department, manager: person.managerName, managerEmail: person.managerEmail, email: person.email } : { name: nm },
      categories: types,
      schedule,
      scheduleNote: scheduleNote.trim() || undefined,
      requestedAt: req,
      expectedStart: start || undefined,
      expectedEnd: end || undefined,
    };
    c.tasks = tasksFor(c, cats);
    const e = await onCreate(c);
    setBusy(false);
    if (e) setErr(e);
  };
  return (
    <Sheet title="New leave case" onClose={onClose}>
      <label className="f">Employee</label>
      {person ? (
        <div className="lv-picked">
          <span className="grow"><b>{person.name}</b> <span className="muted">· {person.title}{person.department ? ` · ${person.department}` : ""}</span></span>
          <button className="btn sm" onClick={() => setPerson(null)}>Change</button>
        </div>
      ) : (
        <>
          <input className="f" placeholder="Search the roster" value={q} onChange={(e) => { setQ(e.target.value); setName(e.target.value); }} autoFocus />
          {hits.map((p) => (
            <button key={p.id} className="lv-hit" onClick={() => { setPerson(p); setQ(""); }}>
              <b>{p.name}</b> <span className="muted">· {p.title}</span>
            </button>
          ))}
          {q.trim() && !hits.length && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Not on the roster. The case will use the name as typed.</p>}
        </>
      )}
      <label className="f">Leave types (pick every protection that may apply)</label>
      <div className="so-values">
        {cats.map((c) => (
          <button key={c.id} className={types.includes(c.id) ? "on" : ""} onClick={() => setTypes(types.includes(c.id) ? types.filter((x) => x !== c.id) : [...types, c.id])}>{c.short}</button>
        ))}
      </div>
      <label className="f">Schedule</label>
      <div className="so-values">
        {(Object.keys(SCHEDULE_LABEL) as Schedule[]).map((s) => (
          <button key={s} className={schedule === s ? "on" : ""} onClick={() => setSchedule(s)}>{SCHEDULE_LABEL[s]}</button>
        ))}
      </div>
      {schedule !== "continuous" && <input className="f" style={{ marginTop: 8 }} placeholder={schedule === "intermittent" ? "e.g. Up to 2 days a month for appointments" : "e.g. 4 hours a day, Mon to Fri"} value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} />}
      <div className="lv-dates">
        <label className="f">Requested<input className="f" type="date" value={req} onChange={(e) => setReq(e.target.value)} /></label>
        <label className="f">Expected start<input className="f" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="f">Expected return<input className="f" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="f">HR admin handling it</label>
      <select className="f" value={owner} onChange={(e) => setOwner(e.target.value)}>
        {assignees.map((a) => <option key={a.email} value={a.email}>{a.name}</option>)}
      </select>
      <p className="tiny muted">The checklist starts from typical timelines for these leave types. Adjust any date to fit the situation.</p>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? "Opening…" : "Open the case"}</button>
      </div>
    </Sheet>
  );
}

/** Write to the employee (or their manager) from a template. */
export function EmailSheet({ c, company, me, onClose, onSend }: { c: LeaveCase; company: string; me: { name: string; email: string }; onClose: () => void; onSend: (b: { to: string; subject: string; body: string; copyMe: boolean; docIds: string[] }) => Promise<string> }) {
  const certDue = c.tasks.find((t) => !t.done && t.key === "certDue")?.due;
  const back = c.extensions.filter((e) => e.status === "approved").map((e) => e.newEnd).sort().pop() || c.expectedEnd;
  const v = { first: c.employee.name.split(" ")[0], company, number: c.number, start: c.actualStart || c.expectedStart, back, due: certDue, hr: me.name.split(" ")[0] };
  const suggest = c.status === "requested" ? "received" : c.tasks.some((t) => !t.done && t.key === "certDue") ? (c.tasks.find((t) => t.key === "certSent")?.done ? "cert-reminder" : "certification") : c.extensions.some((e) => e.status === "requested") ? "extension" : back ? "rtw" : "received";
  const [tpl, setTpl] = useState(suggest);
  const t0 = LEAVE_EMAILS.find((x) => x.id === suggest)!;
  const [subject, setSubject] = useState(fillLeave(t0.subject, v));
  const [body, setBody] = useState(fillLeave(t0.body, v));
  const options = [
    ...(c.employee.email ? [{ email: c.employee.email, label: `${c.employee.name} (employee)` }] : []),
    ...(c.employee.managerEmail ? [{ email: c.employee.managerEmail, label: `${c.employee.manager ?? "Manager"} (manager)` }] : []),
  ];
  const [to, setTo] = useState(options[0]?.email ?? "");
  const [copyMe, setCopyMe] = useState(true);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sendable: CaseDoc[] = c.docs.filter((d) => !d.medical);
  const pick = (id: string) => {
    setTpl(id);
    const t = LEAVE_EMAILS.find((x) => x.id === id);
    if (!t) return;
    setSubject(fillLeave(t.subject, v));
    setBody(fillLeave(t.body, v));
  };
  const toManager = to && to === c.employee.managerEmail;
  return (
    <Sheet title={`Email · ${c.number}`} onClose={onClose}>
      <label className="f">Start from</label>
      <select className="f" value={tpl} onChange={(e) => pick(e.target.value)}>
        {LEAVE_EMAILS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label className="f">To</label>
      {options.length ? (
        <select className="f" value={to} onChange={(e) => setTo(e.target.value)}>
          {options.map((o) => <option key={o.email} value={o.email}>{o.label} · {o.email}</option>)}
        </select>
      ) : (
        <p className="small" style={{ color: "var(--amber)" }}>No email on file for {c.employee.name}. Add one on the roster first.</p>
      )}
      {toManager && <p className="tiny" style={{ color: "var(--amber)", margin: "6px 0 0" }}>Managers only need dates and work impact. Leave out any medical or family details.</p>}
      <label className="f">Subject</label>
      <input className="f" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label className="f">Message</label>
      <textarea className="f" style={{ minHeight: 200 }} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="tiny muted" style={{ margin: "4px 0 0" }}>Fill-ins: {LEAVE_FILL_INS.join(" ")} are filled in for you.</p>
      {sendable.length > 0 && (
        <>
          <label className="f">Attach (medical documents never go by email)</label>
          {sendable.map((d) => (
            <label key={d.id} className="lv-check">
              <input type="checkbox" checked={docIds.includes(d.id)} onChange={() => setDocIds(docIds.includes(d.id) ? docIds.filter((x) => x !== d.id) : [...docIds, d.id])} /> {d.name}
            </label>
          ))}
        </>
      )}
      <label className="lv-check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} /> Send me a copy
      </label>
      <p className="tiny muted">Sends from {company} HR. Replies come to you. It&apos;s saved to the case history.</p>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy || !to}
          onClick={async () => {
            setBusy(true);
            const e = await onSend({ to, subject, body, copyMe, docIds });
            setBusy(false);
            if (e) setErr(e);
          }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </Sheet>
  );
}

export function categoriesForClient(cfg?: { leave?: import("@/lib/leave").LeaveSettings }) {
  return categoriesFor(cfg?.leave);
}
