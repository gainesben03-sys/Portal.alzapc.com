"use client";

// Leave center: HR admins only. Overview, cases, calendar, compliance tasks, reports and (Ben) settings.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { dueLabel, NewCaseSheet, NOT_LEGAL, StatusPill, useAssignees } from "@/components/leaveui";
import { useStore } from "@/lib/store";
import { addDays, backDate, outNow, startingSoon, casesCsv, categoriesFor, daysBetween, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, dashboard, dueItems, fmtDay, LeaveCase, LeaveCategory, LeaveSettings, LeaveStatus, OPEN_STATUSES, report, SCHEDULE_LABEL, STATUS_LABEL, today, Due } from "@/lib/leave";
import { HrAdmin, leaveApi, useLeaveAccess, useLeaveCases } from "@/lib/leaveclient";
import { LIVE } from "@/lib/supabase";

type Tab = "overview" | "cases" | "calendar" | "tasks" | "reports" | "settings";

export default function LeaveCenter() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const router = useRouter();
  const { getClient, config, patch, viewer, me, people } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const acc = useLeaveAccess(clientId);
  const { cases, admins, setAdmins, save, err } = useLeaveCases(clientId, acc.admin);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [adding, setAdding] = useState(false);
  const isAdvisor = viewer?.kind === "advisor";
  const assignees = useAssignees(clientId, admins);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t) setTab(t);
  }, []);
  if (!ok || !client) return null;

  const settings: LeaveSettings = cfg?.leave ?? {};
  const cats = categoriesFor(settings);
  const meP = { name: viewer?.kind === "client" ? viewer.person.name : "Ben Gaines", email: (me?.email ?? "ben@alzapc.com").toLowerCase() };
  const roster = people.filter((p) => p.clientId === clientId);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "overview" ? window.location.pathname : `?tab=${t}`);
  };

  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!acc.ready) return shell(null);
  if (!acc.admin)
    return shell(
      <div className="card section">
        <h1 style={{ marginTop: 0 }}>Leave center</h1>
        <p className="small muted">This area is for HR administrators only. If you need access, ask Ben.</p>
      </div>
    );

  return shell(
    <>
      <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
        <div className="grow">
          <h1 style={{ margin: 0 }}>Leave center</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>Leaves of absence, deadlines, documents and return to work. HR admins only.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ New case</button>
      </div>
      {!cfg?.modules.leave && isAdvisor && <div className="pr-draft tiny">The leave center is off for {client.name}. Only you can see it until you turn it on under Modules.</div>}
      <div className="pr-tabs section" role="tablist">
        {(["overview", "cases", "calendar", "tasks", "reports", ...(isAdvisor ? ["settings"] : [])] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => go(t)}>{t === "overview" ? "Overview" : t === "cases" ? "Cases" : t === "calendar" ? "Calendar" : t === "tasks" ? "Tasks" : t === "reports" ? "Reports" : "Settings"}</button>
        ))}
      </div>
      {err && <div className="card section small" style={{ color: "var(--red)" }}>Couldn&apos;t load leave cases ({err}).</div>}
      {!cases ? (
        <p className="small muted section">Loading…</p>
      ) : (
        <div className="section">
          {tab === "overview" && <Overview cases={cases} settings={settings} base={`/c/${clientId}/leave`} go={go} />}
          {tab === "cases" && <Cases cases={cases} cats={cats} base={`/c/${clientId}/leave`} />}
          {tab === "calendar" && <Calendar cases={cases} cats={cats} base={`/c/${clientId}/leave`} />}
          {tab === "tasks" && (
            <Tasks
              cases={cases}
              settings={settings}
              base={`/c/${clientId}/leave`}
              onDone={async (d) => {
                const c = cases.find((x) => x.id === d.caseId);
                if (!c || !d.taskId) return;
                const r = await save({ ...c, tasks: c.tasks.map((t) => (t.id === d.taskId ? { ...t, done: true, doneAt: today(), doneBy: meP.name } : t)) });
                toast.show(typeof r === "string" ? r : "Done ✓");
              }}
            />
          )}
          {tab === "reports" && <Reports cases={cases} cats={cats} company={client.name} />}
          {tab === "settings" && isAdvisor && (
            <Settings
              clientId={clientId}
              settings={settings}
              admins={admins}
              users={(cfg?.users ?? []).map((u) => ({ email: u.email.toLowerCase(), name: u.name }))}
              cases={cases}
              onSave={(s) => {
                patch({ config: { ...config, [clientId]: { ...cfg, leave: s } } });
                toast.show("Saved");
              }}
              onAdmins={async (list) => {
                if (!LIVE) {
                  setAdmins(list);
                  return toast.show("Saved (demo)");
                }
                const j = await leaveApi(clientId, { action: "admins", admins: list });
                if (!j.ok) return toast.show("Couldn't save HR admins");
                setAdmins(j.admins);
                toast.show("HR admins saved");
              }}
              onDelete={async (c) => {
                if (!confirm(`Permanently delete ${c.number} (${c.employee.name}) and its ${c.docs.length} document(s)? This can't be undone.`)) return;
                if (!LIVE) return toast.show("Demo: deleting happens in the live portal");
                const j = await leaveApi(clientId, { action: "remove", caseId: c.id });
                toast.show(j.ok ? "Deleted" : "Couldn't delete it");
                if (j.ok) window.location.reload();
              }}
            />
          )}
          <p className="tiny muted lv-legal">{NOT_LEGAL}</p>
        </div>
      )}
      {adding && cases && (
        <NewCaseSheet
          clientId={clientId}
          roster={roster}
          cats={cats}
          assignees={assignees}
          me={meP}
          nextNumber={cases.length + 1}
          onClose={() => setAdding(false)}
          onCreate={async (c) => {
            const r = await save(c);
            if (typeof r === "string") return r;
            setAdding(false);
            router.push(`/c/${clientId}/leave/${r.id}`);
            return "";
          }}
        />
      )}
    </>
  );
}

// ---------- overview ----------
function Overview({ cases, settings, base, go }: { cases: LeaveCase[]; settings: LeaveSettings; base: string; go: (t: Tab) => void }) {
  const d = dashboard(cases, settings);
  const out = outNow(cases);
  const soon = startingSoon(cases);
  const Item = ({ x }: { x: Due }) => (
    <Link href={`${base}/${x.caseId}`} className="lv-line">
      <span className="grow">
        <b>{x.who}</b> <span className="tiny muted">{x.number}</span>
        <span className="lv-sub">{x.kind === "return" ? `Expected back ${fmtDay(x.due)}` : x.title}</span>
      </span>
      <span className={`pill ${x.days < 0 ? "overdue" : x.days <= 3 ? "soon" : "later"}`}>{dueLabel(x.days)}</span>
    </Link>
  );
  return (
    <>
      <div className="kpis lv-kpis">
        <button className="kpi" onClick={() => go("cases")}><div className="n">{d.active}</div><div className="l">Active leaves</div></button>
        <button className="kpi" onClick={() => go("cases")}><div className="n">{d.pending}</div><div className="l">New requests</div></button>
        <button className="kpi" onClick={() => go("tasks")}><div className="n">{d.waitingDocs}</div><div className="l">Waiting on documents</div></button>
        <button className={`kpi ${d.overdue.length ? "alert" : ""}`} onClick={() => go("tasks")}><div className="n">{d.overdue.length}</div><div className="l">Overdue HR items</div></button>
      </div>
      <div className="lv-cols section">
        <div className="card">
          <h3 className="lv-h">Overdue</h3>
          {d.overdue.length ? d.overdue.slice(0, 8).map((x) => <Item key={x.caseId + x.title + x.due} x={x} />) : <p className="small muted">Nothing overdue. 👍</p>}
        </div>
        <div className="card">
          <h3 className="lv-h">Deadlines in the next 2 weeks</h3>
          {d.deadlines.length ? d.deadlines.slice(0, 8).map((x) => <Item key={x.caseId + x.title + x.due} x={x} />) : <p className="small muted">No deadlines coming up.</p>}
        </div>
        <div className="card">
          <h3 className="lv-h">Coming back</h3>
          {d.returning.length ? d.returning.map((x) => <Item key={x.caseId + x.due} x={x} />) : <p className="small muted">No returns in the next {settings.returnDays ?? DEFAULT_SETTINGS.returnDays} days.</p>}
        </div>
        <div className="card">
          <h3 className="lv-h">Out now</h3>
          {out.length ? (
            out.map((c) => (
              <Link key={c.id} href={`${base}/${c.id}`} className="lv-line">
                <span className="grow">
                  <b>{c.employee.name}</b> <span className="tiny muted">{c.number}</span>
                  <span className="lv-sub">{c.employee.department ? `${c.employee.department} · ` : ""}{SCHEDULE_LABEL[c.schedule]}{c.actualStart || c.expectedStart ? ` · since ${fmtDay(c.actualStart || c.expectedStart)}` : " · start date not set"}{backDate(c) ? ` · back ${fmtDay(backDate(c))}` : ""}</span>
                </span>
                <StatusPill s={c.status} />
              </Link>
            ))
          ) : (
            <p className="small muted">Nobody is out right now.</p>
          )}
        </div>
        {soon.length > 0 && (
          <div className="card">
            <h3 className="lv-h">Starting soon</h3>
            {soon.map((c) => (
              <Link key={c.id} href={`${base}/${c.id}`} className="lv-line">
                <span className="grow">
                  <b>{c.employee.name}</b> <span className="tiny muted">{c.number}</span>
                  <span className="lv-sub">Starts {fmtDay(c.expectedStart)}{backDate(c) ? ` · back ${fmtDay(backDate(c))}` : ""}</span>
                </span>
                <StatusPill s={c.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- cases ----------
function Cases({ cases, cats, base }: { cases: LeaveCase[]; cats: LeaveCategory[]; base: string }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"open" | "closed" | "all">("open");
  const [type, setType] = useState("");
  const list = cases
    .filter((c) => (show === "all" ? true : show === "open" ? OPEN_STATUSES.includes(c.status) : !OPEN_STATUSES.includes(c.status)))
    .filter((c) => !type || c.categories.includes(type))
    .filter((c) => !q.trim() || `${c.employee.name} ${c.number} ${c.employee.department ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  const name = (id: string) => cats.find((c) => c.id === id)?.short ?? DEFAULT_CATEGORIES.find((c) => c.id === id)?.short ?? id;
  return (
    <>
      <div className="lv-filters">
        <input className="f" placeholder="Search name, case or department" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="f" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
          <option value="open">Open cases</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
        <select className="f" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All leave types</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}
        </select>
      </div>
      {list.length === 0 ? (
        <div className="card small muted">No cases here.</div>
      ) : (
        <div className="card lv-table">
          {list.map((c) => {
            const open = c.tasks.filter((t) => !t.done).length;
            const late = c.tasks.filter((t) => !t.done && t.due && t.due < today()).length;
            return (
              <Link key={c.id} href={`${base}/${c.id}`} className="lv-case">
                <span className="lv-who">
                  <b>{c.employee.name}</b>
                  <span className="tiny muted">{c.number}{c.employee.department ? ` · ${c.employee.department}` : ""}</span>
                </span>
                <span className="lv-types">{c.categories.map((id) => <span key={id} className="lv-tag">{name(id)}</span>)}</span>
                <span className="lv-when tiny muted">{c.expectedStart ? `${fmtDay(c.actualStart || c.expectedStart)} → ${fmtDay(c.actualEnd || c.expectedEnd) || "?"}` : `Requested ${fmtDay(c.requestedAt)}`}</span>
                <span className="lv-stat">
                  <StatusPill s={c.status} />
                  {open > 0 && <span className={`tiny ${late ? "lv-late" : "muted"}`}>{late ? `${late} late` : `${open} to do`}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- calendar ----------
type Ev = { date: string; caseId: string; who: string; text: string; kind: "out" | "start" | "back" | "due" | "int" };
function events(cases: LeaveCase[], from: string, to: string): Ev[] {
  const out: Ev[] = [];
  for (const c of cases) {
    if (["denied", "withdrawn"].includes(c.status)) continue;
    const who = c.employee.name;
    const first = who.split(" ")[0];
    const start = c.actualStart || c.expectedStart;
    const back = c.actualEnd || c.extensions.filter((e) => e.status === "approved").map((e) => e.newEnd).sort().pop() || c.expectedEnd;
    if (start && c.schedule !== "intermittent") {
      const end = back || addDays(today(), 60);
      for (let d = start < from ? from : start; d <= end && d <= to; d = addDays(d, 1)) {
        const wd = new Date(`${d}T12:00:00`).getDay();
        if (wd === 0 || wd === 6) continue;
        if (d === start) out.push({ date: d, caseId: c.id, who, text: `${first} starts leave`, kind: "start" });
        else if (d !== back) out.push({ date: d, caseId: c.id, who, text: `${first} ${c.schedule === "reduced" ? "reduced" : "out"}`, kind: "out" });
      }
    } else if (start && start >= from && start <= to) out.push({ date: start, caseId: c.id, who, text: `${first} leave starts (intermittent)`, kind: "start" });
    if (back && back >= from && back <= to && c.schedule !== "intermittent") out.push({ date: back, caseId: c.id, who, text: `${first} back`, kind: "back" });
    for (const e of c.intermittent) if (e.date >= from && e.date <= to) out.push({ date: e.date, caseId: c.id, who, text: `${first} · ${e.hours}h`, kind: "int" });
    if (OPEN_STATUSES.includes(c.status)) for (const t of c.tasks) if (!t.done && t.due && t.due >= from && t.due <= to) out.push({ date: t.due, caseId: c.id, who, text: `${first}: ${t.title}`, kind: "due" });
  }
  return out;
}
function Calendar({ cases, cats, base }: { cases: LeaveCase[]; cats: LeaveCategory[]; base: string }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [dept, setDept] = useState("");
  const [person, setPerson] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const depts = Array.from(new Set(cases.map((c) => c.employee.department).filter(Boolean) as string[])).sort();
  const names = Array.from(new Set(cases.map((c) => c.employee.name))).sort();
  const shown = cases.filter((c) => (!dept || c.employee.department === dept) && (!person || c.employee.name === person) && (!type || c.categories.includes(type)) && (!status || c.status === status));
  const first = `${month}-01`;
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const last = `${month}-${String(days).padStart(2, "0")}`;
  const evs = useMemo(() => events(shown, first, last), [shown, first, last]);
  const lead = new Date(`${first}T12:00:00`).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const label = new Date(`${first}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const byDay = (d: string) => evs.filter((e) => e.date === d);
  const agenda = Array.from(new Set(evs.map((e) => e.date))).sort();
  const t = today();
  return (
    <>
      <div className="lv-filters">
        <select className="f" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <select className="f" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Everyone</option>{names.map((d) => <option key={d}>{d}</option>)}</select>
        <select className="f" value={type} onChange={(e) => setType(e.target.value)}><option value="">All leave types</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}</select>
        <select className="f" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{(Object.keys(STATUS_LABEL) as LeaveStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
      </div>
      <div className="lv-calbar">
        <button className="btn sm" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <b>{label}</b>
        <button className="btn sm" onClick={() => shift(1)} aria-label="Next month">›</button>
        <button className="btn sm" onClick={() => setMonth(today().slice(0, 7))}>Today</button>
        <span className="lv-legend tiny"><i className="out" /> Out <i className="start" /> Starts <i className="back" /> Back <i className="int" /> Intermittent <i className="due" /> Deadline</span>
      </div>
      <div className="lv-cal card">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="lv-dow">{d}</div>)}
        {cells.map((d, i) =>
          d ? (
            <div key={d} className={`lv-day ${d === t ? "today" : ""}`}>
              <span className="lv-num">{Number(d.slice(8))}</span>
              {byDay(d).slice(0, 4).map((e, k) => <Link key={k} href={`${base}/${e.caseId}`} className={`lv-ev ${e.kind}`} title={e.text}>{e.text}</Link>)}
              {byDay(d).length > 4 && <span className="tiny muted">+{byDay(d).length - 4} more</span>}
            </div>
          ) : (
            <div key={`x${i}`} className="lv-day blank" />
          )
        )}
      </div>
      <div className="lv-agenda card">
        {agenda.length === 0 ? (
          <p className="small muted">Nothing this month.</p>
        ) : (
          agenda.map((d) => (
            <div key={d} className="lv-aday">
              <b className={d === t ? "lv-todaytxt" : ""}>{new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>
              {byDay(d).map((e, k) => <Link key={k} href={`${base}/${e.caseId}`} className={`lv-ev ${e.kind}`}>{e.text}</Link>)}
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------- tasks ----------
function Tasks({ cases, settings, base, onDone }: { cases: LeaveCase[]; settings: LeaveSettings; base: string; onDone: (d: Due) => void }) {
  const [mine, setMine] = useState(false);
  const { me } = useStore();
  const email = (me?.email ?? "ben@alzapc.com").toLowerCase();
  const items = dueItems(mine ? cases.filter((c) => c.assignedTo?.email?.toLowerCase() === email) : cases, settings);
  const groups: [string, Due[]][] = [
    ["Overdue", items.filter((x) => x.days < 0)],
    ["This week", items.filter((x) => x.days >= 0 && x.days <= 7)],
    ["Later", items.filter((x) => x.days > 7)],
  ];
  return (
    <>
      <div className="so-values" style={{ marginBottom: 12 }}>
        <button className={!mine ? "on" : ""} onClick={() => setMine(false)}>All cases</button>
        <button className={mine ? "on" : ""} onClick={() => setMine(true)}>Assigned to me</button>
      </div>
      {groups.map(([g, l]) => (
        <div key={g} className="card" style={{ marginBottom: 12 }}>
          <h3 className="lv-h">{g} <span className="muted">· {l.length}</span></h3>
          {l.length === 0 ? (
            <p className="small muted">Nothing here.</p>
          ) : (
            l.map((x) => (
              <div key={x.caseId + x.title + x.due} className="lv-task">
                {x.taskId ? <input type="checkbox" aria-label="Mark done" onChange={() => onDone(x)} /> : <span className="lv-dot" />}
                <Link href={`${base}/${x.caseId}`} className="grow">
                  <b>{x.title}</b>
                  <span className="lv-sub">{x.who} · {x.number} · {fmtDay(x.due)}</span>
                </Link>
                <span className={`pill ${x.days < 0 ? "overdue" : x.days <= 3 ? "soon" : "later"}`}>{dueLabel(x.days)}</span>
              </div>
            ))
          )}
        </div>
      ))}
    </>
  );
}

// ---------- reports ----------
function Reports({ cases, cats, company }: { cases: LeaveCase[]; cats: LeaveCategory[]; company: string }) {
  const [range, setRange] = useState<"12" | "all">("12");
  const cut = addDays(today(), -365);
  const list = range === "all" ? cases : cases.filter((c) => OPEN_STATUSES.includes(c.status) || (c.actualEnd || c.expectedEnd || c.requestedAt) >= cut);
  const r = report(list, cats);
  const max = Math.max(1, ...r.byType.map((x) => x.n));
  const csv = () => {
    const blob = new Blob([casesCsv(list, cats)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${company.replace(/[^A-Za-z0-9]+/g, "-")}-leave-cases-${today()}.csv`;
    a.click();
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <div className="so-values grow">
          <button className={range === "12" ? "on" : ""} onClick={() => setRange("12")}>Last 12 months</button>
          <button className={range === "all" ? "on" : ""} onClick={() => setRange("all")}>All time</button>
        </div>
        <button className="btn sm" onClick={csv}>Download CSV</button>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="n">{r.open}</div><div className="l">Open cases</div></div>
        <div className="kpi"><div className="n">{r.total}</div><div className="l">Cases in this period</div></div>
        <div className="kpi"><div className="n">{r.avgDays ?? "–"}</div><div className="l">Average length (days)</div></div>
        <div className={`kpi ${r.overdue ? "alert" : ""}`}><div className="n">{r.overdue}</div><div className="l">Overdue items ({r.upcoming} due in 30 days)</div></div>
      </div>
      <div className="lv-cols section">
        <div className="card">
          <h3 className="lv-h">By leave type</h3>
          {r.byType.length === 0 && <p className="small muted">No cases yet.</p>}
          {r.byType.map((x) => (
            <div key={x.type} className="lv-bar">
              <span>{x.type}</span>
              <i style={{ width: `${(x.n / max) * 100}%` }} />
              <b>{x.n}</b>
            </div>
          ))}
          <p className="tiny muted">One case can count under more than one type.</p>
        </div>
        <div className="card">
          <h3 className="lv-h">By status</h3>
          {r.byStatus.map((x) => (
            <div key={x.status} className="lv-kv"><span>{x.status}</span><b>{x.n}</b></div>
          ))}
          <h3 className="lv-h" style={{ marginTop: 16 }}>Intermittent leave</h3>
          <div className="lv-kv"><span>Cases</span><b>{r.intermittent.cases}</b></div>
          <div className="lv-kv"><span>Absences logged</span><b>{r.intermittent.entries}</b></div>
          <div className="lv-kv"><span>Hours used</span><b>{r.intermittent.hours}</b></div>
        </div>
        <div className="card lv-span2">
          <h3 className="lv-h">Outstanding notices and documents</h3>
          {r.outstandingDocs.length === 0 ? (
            <p className="small muted">Nothing outstanding.</p>
          ) : (
            r.outstandingDocs.map((x, i) => (
              <div key={i} className="lv-kv">
                <span>{x.title} <span className="muted">· {x.who} ({x.number})</span></span>
                <b className={x.due && x.due < today() ? "lv-late" : ""}>{fmtDay(x.due)}</b>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ---------- settings (Ben) ----------
function Settings({ settings, admins, users, cases, onSave, onAdmins, onDelete }: { clientId?: string; settings: LeaveSettings; admins: HrAdmin[]; users: { email: string; name: string }[]; cases: LeaveCase[]; onSave: (s: LeaveSettings) => void; onAdmins: (l: HrAdmin[]) => void; onDelete: (c: LeaveCase) => void }) {
  const [list, setList] = useState<HrAdmin[]>(admins);
  const [add, setAdd] = useState("");
  const [s, setS] = useState<LeaveSettings>(settings);
  const [newType, setNewType] = useState("");
  const set = { ...DEFAULT_SETTINGS, ...s };
  const hidden = s.hidden ?? [];
  const old = cases.filter((c) => (c.status === "closed" || c.status === "withdrawn" || c.status === "denied") && daysBetween((c.closedAt ?? c.updatedAt).slice(0, 10), today()) > set.retainYears * 365);
  const custom = (s.categories ?? []).filter((c) => c.custom);
  useEffect(() => setList(admins), [admins]);
  return (
    <>
      <div className="card">
        <h3 className="lv-h">HR admins</h3>
        <p className="small muted" style={{ marginTop: 0 }}>Only these people (and you) can see the leave center. Executives and managers can&apos;t, unless you add them here. Turn off medical access for anyone who shouldn&apos;t open medical documents.</p>
        {list.map((a) => (
          <div key={a.email} className="lv-admin">
            <span className="grow"><b>{users.find((u) => u.email === a.email)?.name ?? a.email}</b> <span className="tiny muted">{a.email}</span></span>
            <label className="lv-check"><input type="checkbox" checked={a.medical} onChange={(e) => setList(list.map((x) => (x.email === a.email ? { ...x, medical: e.target.checked } : x)))} /> Medical documents</label>
            <button className="btn sm" onClick={() => setList(list.filter((x) => x.email !== a.email))}>Remove</button>
          </div>
        ))}
        <div className="lv-addrow">
          <select className="f" value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Add someone with portal access…</option>
            {users.filter((u) => !list.some((a) => a.email === u.email)).map((u) => <option key={u.email} value={u.email}>{u.name} · {u.email}</option>)}
          </select>
          <button className="btn sm" disabled={!add} onClick={() => { setList([...list, { email: add, medical: true }]); setAdd(""); }}>Add</button>
        </div>
        <div className="sheet-actions"><button className="btn primary sm" onClick={() => onAdmins(list)}>Save HR admins</button></div>
      </div>

      <div className="card section">
        <h3 className="lv-h">Reminders</h3>
        <p className="small muted" style={{ marginTop: 0 }}>Each morning, the assigned HR admin and you get one email listing what&apos;s coming due. It shows the case number and first name only, never medical details.</p>
        <span className="flabel">Remind this many days before a deadline</span>
        <div className="so-values">
          {[14, 7, 5, 3, 2, 1, 0].map((n) => (
            <button key={n} className={set.remindDays.includes(n) ? "on" : ""} onClick={() => setS({ ...s, remindDays: set.remindDays.includes(n) ? set.remindDays.filter((x) => x !== n) : [...set.remindDays, n].sort((a, b) => b - a) })}>{n === 0 ? "Day of" : `${n}`}</button>
          ))}
        </div>
        <div className="lv-dates">
          <label className="f">Flag returns this many days ahead<input className="f" type="number" min={1} max={60} value={set.returnDays} onChange={(e) => setS({ ...s, returnDays: Math.max(1, Number(e.target.value) || 14) })} /></label>
          <label className="f">Check in after this many quiet days<input className="f" type="number" min={7} max={90} value={set.followupDays} onChange={(e) => setS({ ...s, followupDays: Math.max(7, Number(e.target.value) || 21) })} /></label>
          <label className="f">Keep closed cases (years)<input className="f" type="number" min={1} max={30} value={set.retainYears} onChange={(e) => setS({ ...s, retainYears: Math.max(1, Number(e.target.value) || 5) })} /></label>
        </div>
        <label className="f">Also send reminders to (optional, comma separated)</label>
        <input className="f" value={(s.notify ?? []).join(", ")} onChange={(e) => setS({ ...s, notify: e.target.value.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
      </div>

      <div className="card section">
        <h3 className="lv-h">Leave types</h3>
        <p className="small muted" style={{ marginTop: 0 }}>Turn off types this client doesn&apos;t use. Add state or local leave types (for example, a city&apos;s paid sick leave). Timelines are starting points; HR adjusts dates per case.</p>
        <div className="so-values">
          {DEFAULT_CATEGORIES.map((c) => (
            <button key={c.id} className={hidden.includes(c.id) ? "" : "on"} onClick={() => setS({ ...s, hidden: hidden.includes(c.id) ? hidden.filter((x) => x !== c.id) : [...hidden, c.id] })}>{c.short}</button>
          ))}
          {custom.map((c) => (
            <button key={c.id} className="on" title="Remove" onClick={() => setS({ ...s, categories: (s.categories ?? []).filter((x) => x.id !== c.id) })}>{c.short} ✕</button>
          ))}
        </div>
        <div className="lv-addrow">
          <input className="f" placeholder="New leave type, e.g. LA City paid sick leave" value={newType} onChange={(e) => setNewType(e.target.value)} />
          <button
            className="btn sm"
            disabled={!newType.trim()}
            onClick={() => {
              const nm = newType.trim().slice(0, 50);
              const c: LeaveCategory = { id: `c${Date.now().toString(36)}`, name: nm, short: nm.slice(0, 24), custom: true, tasks: [{ key: "review", title: `Review ${nm} requirements`, kind: "notice", anchor: "requested", days: 5, business: true }] };
              setS({ ...s, categories: [...(s.categories ?? []), c] });
              setNewType("");
            }}
          >
            Add
          </button>
        </div>
        <div className="sheet-actions"><button className="btn primary sm" onClick={() => onSave(s)}>Save settings</button></div>
      </div>

      <div className="card section">
        <h3 className="lv-h">Retention</h3>
        {old.length === 0 ? (
          <p className="small muted">No closed cases older than {set.retainYears} years.</p>
        ) : (
          old.map((c) => (
            <div key={c.id} className="lv-admin">
              <span className="grow"><b>{c.number}</b> <span className="tiny muted">{c.employee.name} · closed {fmtDay((c.closedAt ?? c.updatedAt).slice(0, 10))}</span></span>
              <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => onDelete(c)}>Delete</button>
            </div>
          ))
        )}
        <p className="tiny muted">Check how long records must be kept before deleting. Federal FMLA records: at least 3 years. Medical records stay separate from personnel files.</p>
      </div>
    </>
  );
}

