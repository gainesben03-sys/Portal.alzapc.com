"use client";

// Offboarding: who's leaving, their checklist, the goodbye email and exit survey. Ben and executives only.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import { onboardingFor, longDate, shortDate } from "@/lib/hires";
import { DEFAULT_OFFBOARD, Departure, goodbyeEmail, InfoSection, LeaveType, newToken, OffboardSettings, offboardFor, sendOn, tasksFor, TYPE_LABEL } from "@/lib/offboard";
import { offboardApi, soonDays, useDepartures } from "@/lib/offboardclient";
import { LIVE } from "@/lib/supabase";

type Tab = "leaving" | "past" | "settings";
const fit = (html: string) => html.replace("<html>", '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>table[width="600"]{width:100%!important}td{word-break:break-word}</style></head>');

export default function Offboarding() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const router = useRouter();
  const { getClient, config, patch, viewer, me, people } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const allowed = viewer?.kind === "advisor" || me?.access === "exec";
  const { list, err, save } = useDepartures(clientId, allowed);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("leaving");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t) setTab(t);
  }, []);
  if (!ok || !client) return null;
  const s = onboardingFor(cfg?.onboarding);
  const o = offboardFor(cfg?.offboarding);
  const meName = viewer?.kind === "client" ? viewer.person.name : "Ben Gaines";

  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!allowed) return shell(<div className="card section small muted">Offboarding is for executives and Ben.</div>);

  const leaving = (list ?? []).filter((d) => d.status === "planned").sort((a, b) => (a.lastDay < b.lastDay ? -1 : 1));
  const past = (list ?? []).filter((d) => d.status !== "planned").sort((a, b) => (a.lastDay > b.lastDay ? -1 : 1));
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "leaving" ? window.location.pathname : `?tab=${t}`);
  };

  return shell(
    <>
      <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
        <div className="grow">
          <h1 style={{ margin: 0 }}>Offboarding</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>When someone resigns or is let go: the checklist, a thank-you email, an exit survey, and off the roster after their last day.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Someone is leaving</button>
      </div>
      {!cfg?.modules.offboarding && viewer?.kind === "advisor" && <div className="pr-draft tiny">Offboarding is off for {client.name}. Only you can see it until you turn it on under Modules.</div>}
      <div className="pr-tabs section" role="tablist">
        <button className={tab === "leaving" ? "on" : ""} onClick={() => go("leaving")}>Leaving {leaving.length ? <span className="muted">{leaving.length}</span> : null}</button>
        <button className={tab === "past" ? "on" : ""} onClick={() => go("past")}>Past</button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => go("settings")}>Email &amp; checklist</button>
      </div>
      {err === "setup" && <div className="card section small">Offboarding needs one database step: run <b>supabase/018_offboarding.sql</b> in Supabase.</div>}
      {err === "load" && <div className="card section small" style={{ color: "var(--red)" }}>Couldn&apos;t load offboarding. Refresh to try again.</div>}
      <div className="section">
        {tab !== "settings" && !list && !err && <p className="small muted">Loading…</p>}
        {tab === "leaving" && list && (leaving.length ? <DepList list={leaving} base={`/c/${clientId}/offboarding`} o={o} /> : <div className="card small muted">Nobody is leaving right now.</div>)}
        {tab === "past" && list && (past.length ? <DepList list={past} base={`/c/${clientId}/offboarding`} o={o} past /> : <div className="card small muted">No one yet.</div>)}
        {tab === "settings" && (
          <Settings
            o={o}
            company={client.name}
            s={s}
            accent={cfg?.accent || "#19283c"}
            onSave={async (next) => {
              if (viewer?.kind === "advisor") patch({ config: { ...config, [clientId]: { ...cfg, offboarding: next } } });
              else if (LIVE) {
                const j = await offboardApi(clientId, { action: "settings", settings: next });
                if (!j.ok) return toast.show("Couldn't save. Try again.");
                patch({ config: { ...config, [clientId]: { ...cfg, offboarding: j.settings } } });
              } else patch({ config: { ...config, [clientId]: { ...cfg, offboarding: next } } });
              toast.show("Saved");
            }}
          />
        )}
      </div>
      {adding && (
        <StartSheet
          roster={people.filter((p) => p.clientId === clientId && p.active)}
          onClose={() => setAdding(false)}
          onStart={async (d) => {
            const now = new Date().toISOString();
            const dep: Departure = {
              ...d,
              id: `off${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
              clientId,
              status: "planned",
              tasks: tasksFor(d, s.payroll, o.extraTasks),
              email: { auto: true },
              survey: o.survey ? { token: newToken() } : undefined,
              notes: [],
              history: [{ at: now, by: meName, text: `Offboarding started: ${TYPE_LABEL[d.type].toLowerCase()}, last day ${d.lastDay}` }],
              createdAt: now,
              createdBy: meName,
            };
            const e = await save(dep);
            if (e) return e;
            setAdding(false);
            router.push(`/c/${clientId}/offboarding/${dep.id}`);
            return "";
          }}
        />
      )}
    </>
  );
}

function DepList({ list, base, o, past }: { list: Departure[]; base: string; o: OffboardSettings; past?: boolean }) {
  return (
    <div className="card lv-table">
      {list.map((d) => {
        const open = d.tasks.filter((t) => !t.done).length;
        const days = soonDays(d);
        return (
          <Link key={d.id} href={`${base}/${d.id}`} className="lv-case">
            <span className="lv-who">
              <b>{d.name}</b>
              <span className="tiny muted">{[d.title, d.department].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="lv-types"><span className="lv-tag">{TYPE_LABEL[d.type]}</span>{d.survey?.doneAt && <span className="lv-tag">Survey in</span>}</span>
            <span className="lv-when tiny muted">Last day {longDate(d.lastDay)}{!past && !d.email.sentAt && o.autoSend && d.email.auto ? ` · email ${shortDate(sendOn(d, o))}` : ""}</span>
            <span className="lv-stat">
              {past ? <span className="pill later">{d.status === "cancelled" ? "Cancelled" : "Left"}</span> : <span className={`pill ${days < 0 ? "overdue" : days <= 3 ? "soon" : "later"}`}>{days < 0 ? "Past last day" : days === 0 ? "Last day today" : `${days} days`}</span>}
              {open > 0 && <span className="tiny muted">{open} to do</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

type Roster = { id: string; name: string; title: string; email?: string; department?: string; managerName: string };
function StartSheet({ roster, onClose, onStart }: { roster: Roster[]; onClose: () => void; onStart: (d: Omit<Departure, "id" | "clientId" | "status" | "tasks" | "email" | "notes" | "history" | "createdAt" | "createdBy">) => Promise<string> }) {
  const [q, setQ] = useState("");
  const [p, setP] = useState<Roster | null>(null);
  const [type, setType] = useState<LeaveType>("resignation");
  const [notice, setNotice] = useState(new Date().toISOString().slice(0, 10));
  const [last, setLast] = useState("");
  const [personal, setPersonal] = useState("");
  const [rehire, setRehire] = useState<"yes" | "no" | "unsure">("unsure");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hits = q.trim() ? roster.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <Sheet title="Someone is leaving" onClose={onClose}>
      <label className="f">Who</label>
      {p ? (
        <div className="lv-picked"><span className="grow"><b>{p.name}</b> <span className="muted">· {p.title}</span></span><button className="btn sm" onClick={() => setP(null)}>Change</button></div>
      ) : (
        <>
          <input className="f" placeholder="Search the roster" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {hits.map((x) => <button key={x.id} className="lv-hit" onClick={() => { setP(x); setQ(""); }}><b>{x.name}</b> <span className="muted">· {x.title}</span></button>)}
          {q.trim() && !hits.length && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Not on the roster. We&apos;ll use the name as typed.</p>}
        </>
      )}
      <label className="f">Type</label>
      <div className="so-values">
        {(Object.keys(TYPE_LABEL) as LeaveType[]).map((t) => <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}
      </div>
      <div className="lv-dates">
        <label className="f">{type === "resignation" || type === "retirement" ? "Notice given" : "Decided / told"}<input className="f" type="date" value={notice} onChange={(e) => setNotice(e.target.value)} /></label>
        <label className="f">Last day<input className="f" type="date" value={last} onChange={(e) => setLast(e.target.value)} /></label>
        <label className="f">Eligible for rehire?<select className="f" value={rehire} onChange={(e) => setRehire(e.target.value as typeof rehire)}><option value="unsure">Not sure yet</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      <label className="f">Personal email <span className="tiny muted">(the goodbye email goes here; work email may be off by then)</span><input className="f" type="email" value={personal} onChange={(e) => setPersonal(e.target.value)} /></label>
      <label className="f">Reason <span className="tiny muted">(private: you and Ben only)</span><textarea className="f" style={{ minHeight: 70 }} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            const name = p?.name ?? q.trim();
            if (!name) return setErr("Pick who's leaving.");
            if (!last) return setErr("Add their last day.");
            if (personal.trim() && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(personal.trim())) return setErr("That personal email doesn't look right.");
            setBusy(true);
            const e = await onStart({ personId: p?.id, name, title: p?.title, department: p?.department, managerName: p?.managerName, workEmail: p?.email, type, noticeDate: notice || undefined, lastDay: last, personalEmail: personal.trim().toLowerCase() || undefined, rehire, reason: reason.trim() || undefined });
            setBusy(false);
            if (e) setErr(e);
          }}
        >
          {busy ? "Starting…" : "Start offboarding"}
        </button>
      </div>
    </Sheet>
  );
}

function Settings({ o, company, s, accent, onSave }: { o: OffboardSettings; company: string; s: ReturnType<typeof onboardingFor>; accent: string; onSave: (o: OffboardSettings) => void }) {
  const [x, setX] = useState<OffboardSettings>(o);
  const [extra, setExtra] = useState((o.extraTasks ?? []).join("\n"));
  const set = (p: Partial<OffboardSettings>) => setX({ ...x, ...p });
  const setSec = (i: number, p: Partial<InfoSection>) => set({ sections: x.sections.map((y, k) => (k === i ? { ...y, ...p } : y)) });
  const sample: Departure = { id: "x", clientId: "x", status: "planned", name: "Alex Sample", type: "resignation", lastDay: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), tasks: [], email: { auto: true }, notes: [], history: [], createdAt: "", createdBy: "" };
  const mail = useMemo(() => goodbyeEmail(sample, x, s, { company, accent }, x.survey ? "https://portal.alzapc.com/exit/sample" : undefined), [x, s, company, accent]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ob-set">
      <div className="ob-edit">
        <div className="card">
          <h3 className="lv-h">The goodbye email</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Fill-ins: {"{first name}"} {"{company}"} {"{last day}"} {"{HR name}"} {"{HR email}"}. Start a line with &quot;- &quot; to make a checklist. **Double stars** make bold.</p>
          <label className="f">Opening message<textarea className="f" style={{ minHeight: 150 }} value={x.thanks} onChange={(e) => set({ thanks: e.target.value })} /></label>
          {x.sections.map((sec, i) => (
            <div key={sec.id} className="ob-sec">
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <input className="f grow" value={sec.title} placeholder="Section title" onChange={(e) => setSec(i, { title: e.target.value })} aria-label="Section title" />
                <button className="btn sm" aria-label="Move up" disabled={i === 0} onClick={() => { const a = [...x.sections]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ sections: a }); }}>↑</button>
                <button className="btn sm lv-x" aria-label="Remove section" onClick={() => set({ sections: x.sections.filter((_, k) => k !== i) })}>✕</button>
              </div>
              <textarea className="f" style={{ minHeight: 90 }} value={sec.text} onChange={(e) => setSec(i, { text: e.target.value })} aria-label="Section text" />
            </div>
          ))}
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => set({ sections: [...x.sections, { id: `s${Date.now().toString(36)}`, title: "New section", text: "" }] })}>+ Add a section</button>
          <label className="f">Closing line<input className="f" value={x.closing} onChange={(e) => set({ closing: e.target.value })} /></label>
          <label className="lv-check" style={{ marginTop: 10 }}><input type="checkbox" checked={x.survey} onChange={(e) => set({ survey: e.target.checked })} /> Include the exit survey (7 short questions; answers go to you and Ben)</label>
        </div>
        <div className="card section">
          <h3 className="lv-h">When it goes out</h3>
          <label className="lv-check"><input type="checkbox" checked={x.autoSend} onChange={(e) => set({ autoSend: e.target.checked })} /> Send it automatically</label>
          <label className="f">Days before the last day <span className="tiny muted">(0 = on the last day)</span><input className="f" type="number" min={0} max={14} value={x.sendDaysBefore} onChange={(e) => set({ sendDaysBefore: Math.max(0, Math.min(14, Number(e.target.value) || 0)) })} /></label>
          <p className="tiny muted">You can turn it off for one person, add a personal note, or send it early from their page.</p>
        </div>
        <div className="card section">
          <h3 className="lv-h">Your own checklist items</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Added to every new offboarding, after the standard steps. One per line.</p>
          <textarea className="f" style={{ minHeight: 90 }} value={extra} placeholder={"e.g. Cancel their parking pass\nRemove them from the team Slack"} onChange={(e) => { setExtra(e.target.value); set({ extraTasks: e.target.value.split("\n").map((t) => t.trim()).filter(Boolean) }); }} />
        </div>
        <div className="sheet-actions">
          <button className="btn" onClick={() => { setX(DEFAULT_OFFBOARD); setExtra(""); }}>Start over</button>
          <button className="btn primary" onClick={() => onSave(x)}>Save</button>
        </div>
      </div>
      <div className="ob-prev">
        <div className="tiny muted" style={{ marginBottom: 6 }}><b>Subject:</b> {mail.subject} · preview with a sample name</div>
        <iframe className="email-frame" title="Goodbye email preview" srcDoc={fit(mail.html)} sandbox="" />
      </div>
    </div>
  );
}
