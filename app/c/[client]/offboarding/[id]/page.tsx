"use client";

// One person leaving: dates, checklist, goodbye email, exit survey, notes and history.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import { longDate, onboardingFor, shortDate } from "@/lib/hires";
import { Departure, DepartureTask, goodbyeEmail, LeaveType, offboardFor, sendOn, TYPE_LABEL } from "@/lib/offboard";
import { offboardApi, soonDays, useDepartures } from "@/lib/offboardclient";
import { LIVE } from "@/lib/supabase";
import { fmtTime } from "@/lib/data";

const GROUP: Record<DepartureTask["group"], string> = { before: "Before the last day", lastDay: "On the last day", after: "After they leave" };
const fit = (html: string) => html.replace("<html>", '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>table[width="600"]{width:100%!important}td{word-break:break-word}</style></head>');

export default function DeparturePage() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, viewer, me } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const allowed = viewer?.kind === "advisor" || me?.access === "exec";
  const { list, save, replace } = useDepartures(clientId, allowed);
  const toast = useToast();
  const [newTask, setNewTask] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState("");
  if (!ok || !client) return null;
  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!allowed) return shell(<div className="card section small muted">Offboarding is for executives and Ben.</div>);
  const d = list?.find((x) => x.id === id);
  if (!list) return shell(<p className="small muted">Loading…</p>);
  if (!d) return shell(<div className="card section small muted">Not found. <Link href={`/c/${clientId}/offboarding`}>Back to offboarding</Link></div>);

  const s = onboardingFor(cfg?.onboarding);
  const o = offboardFor(cfg?.offboarding);
  const meName = viewer?.kind === "client" ? viewer.person.name : "Ben Gaines";
  const log = (text: string) => [...d.history, { at: new Date().toISOString(), by: meName, text }];
  const upd = async (p: Partial<Departure>, msg = "Saved", hist?: string) => {
    const e = await save({ ...d, ...p, history: hist ? log(hist) : p.history ?? d.history });
    toast.show(e || msg);
  };
  const setTask = (t: DepartureTask, p: Partial<DepartureTask>) => upd({ tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, ...p } : x)) }, p.done ? "Done ✓" : "Saved", p.done ? `Done: ${t.title}` : undefined);
  const days = soonDays(d);
  const open = d.tasks.filter((t) => !t.done).length;
  const mail = goodbyeEmail(d, o, s, { company: client.name, accent: cfg?.accent || "#19283c" }, o.survey ? `${typeof window !== "undefined" ? window.location.origin : ""}/exit/${d.survey?.token ?? "preview"}` : undefined);
  const scheduled = o.autoSend && d.email.auto && !d.email.sentAt && d.status === "planned";

  const send = async (test: boolean) => {
    if (!test && !d.personalEmail && !d.workEmail) return toast.show("Add a personal email first.");
    if (!LIVE) {
      if (test) return toast.show("Demo: test emails go out in the live portal.");
      const at = new Date().toISOString();
      await save({ ...d, email: { ...d.email, sentAt: at, to: d.personalEmail }, survey: d.survey ? { ...d.survey, sentAt: at } : d.survey, history: log(`Goodbye email sent to ${d.personalEmail} (demo, not really sent)`) });
      setPreview(false);
      return toast.show("Marked as sent (demo)");
    }
    setBusy(test ? "test" : "send");
    const j = await offboardApi(clientId, { action: "send", id: d.id, test });
    setBusy("");
    if (!j.ok) return toast.show(j.reason === "no_email" ? "There's no email on file for them." : "Couldn't send it. Try again.");
    if (j.departure) replace(j.departure);
    if (!test) setPreview(false);
    toast.show(test ? `Test sent to ${j.to}` : `Sent to ${j.to}`);
  };
  const offRoster = async () => {
    if (!confirm(`Take ${d.name} off the team roster now? They'll stop showing in shoutouts and celebrations. (This happens on its own the day after their last day.)`)) return;
    if (!LIVE) return upd({ rosterRemovedAt: new Date().toISOString() }, "Taken off the roster (demo)", "Taken off the team roster");
    const j = await offboardApi(clientId, { action: "roster", id: d.id });
    if (j.ok) {
      replace(j.departure);
      toast.show("Taken off the roster");
    } else toast.show("Couldn't do that. Try again.");
  };

  return shell(
    <>
      <Link href={`/c/${clientId}/offboarding`} className="tiny muted">← Offboarding</Link>
      <div className="lv-head">
        <div className="grow">
          <div className="tiny muted">{TYPE_LABEL[d.type]}{d.noticeDate ? ` · ${d.type === "resignation" || d.type === "retirement" ? "notice" : "told"} ${shortDate(d.noticeDate)}` : ""}</div>
          <h1 style={{ margin: "2px 0 4px" }}>{d.name}</h1>
          <div className="small muted">{[d.title, d.department, d.managerName ? `reports to ${d.managerName}` : ""].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="lv-headact">
          {d.status === "planned" ? <span className={`pill ${days < 0 ? "overdue" : days <= 3 ? "soon" : "later"}`}>{days < 0 ? "Past last day" : days === 0 ? "Last day today" : `Last day in ${days} days`}</span> : <span className="pill later">{d.status === "cancelled" ? "Cancelled" : "Left"}</span>}
        </div>
      </div>

      <div className="lv-detail section">
        <div className="lv-main">
          <div className="card">
            <h3 className="lv-h">Checklist <span className="muted">· {open} open</span></h3>
            {(["before", "lastDay", "after"] as const).map((g) => {
              const items = d.tasks.filter((t) => t.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className="ob-group">
                  <span className="cc-label">{GROUP[g]}</span>
                  {items.map((t) => (
                    <div key={t.id} className={`lv-task ${t.done ? "done" : ""}`}>
                      <input type="checkbox" checked={t.done} aria-label={t.done ? "Mark not done" : "Mark done"} onChange={() => setTask(t, t.done ? { done: false, doneAt: undefined, doneBy: undefined } : { done: true, doneAt: new Date().toISOString().slice(0, 10), doneBy: meName })} />
                      <span className="grow">
                        {t.done ? <s>{t.title}</s> : <b>{t.title}</b>}
                        <span className="lv-sub">{t.done ? `${t.doneBy ?? ""}${t.doneAt ? `, ${shortDate(t.doneAt)}` : ""}` : [t.due ? `By ${shortDate(t.due)}` : "", t.hint].filter(Boolean).join(" · ")}</span>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="lv-addrow">
              <input className="f" placeholder="Add a step" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
              <button className="btn sm" disabled={!newTask.trim()} onClick={async () => { await upd({ tasks: [...d.tasks, { id: `t${Date.now().toString(36)}`, title: newTask.trim().slice(0, 140), group: "before", due: d.lastDay, done: false }] }, "Added"); setNewTask(""); }}>Add</button>
            </div>
            <p className="tiny muted">California reminders are there to check, not legal advice. Ask Ben if a situation is unclear.</p>
          </div>

          <div className="card section">
            <h3 className="lv-h">Exit survey</h3>
            {!o.survey && !d.survey?.doneAt ? (
              <p className="small muted">The exit survey is off. Turn it on under Email &amp; checklist.</p>
            ) : d.survey?.doneAt ? (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>Completed {fmtTime(d.survey.doneAt)}. Only executives and Ben can see this.</p>
                {(d.survey.answers ?? []).map((a) => (
                  <div key={a.q} className="ob-ans">
                    <span className="lv-sub">{a.q}</span>
                    <b>{/^[1-5]$/.test(a.a) ? `${"★".repeat(Number(a.a))}${"☆".repeat(5 - Number(a.a))} ${a.a}/5` : a.a}</b>
                  </div>
                ))}
              </>
            ) : (
              <p className="small muted">{d.survey?.sentAt ? `Sent ${fmtTime(d.survey.sentAt)}. No answers yet. You'll get an email when it comes in.` : "Goes out with the goodbye email."}</p>
            )}
          </div>

          <div className="card section">
            <h3 className="lv-h">Notes</h3>
            {d.reason && <div className="ob-reason small"><span className="cc-label">Reason (private)</span><p>{d.reason}</p></div>}
            <textarea className="f" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="sheet-actions" style={{ marginTop: 8 }}>
              <button className="btn sm primary" disabled={!note.trim()} onClick={async () => { await upd({ notes: [{ at: new Date().toISOString(), by: meName, text: note.trim().slice(0, 3000) }, ...d.notes] }, "Note added"); setNote(""); }}>Add note</button>
            </div>
            {d.notes.map((n, i) => (
              <div key={i} className="lv-note"><div className="tiny muted">{n.by} · {fmtTime(n.at)}</div><p>{n.text}</p></div>
            ))}
          </div>
        </div>

        <aside className="lv-side">
          <div className="card">
            <h3 className="lv-h">Details</h3>
            <label className="lv-daterow"><span>Last day</span><input type="date" className="f" value={d.lastDay} onChange={(e) => e.target.value && upd({ lastDay: e.target.value }, "Saved", `Last day changed to ${e.target.value}`)} /></label>
            <label className="lv-daterow"><span>Type</span><select className="f" value={d.type} onChange={(e) => upd({ type: e.target.value as LeaveType }, "Saved", `Type changed to ${TYPE_LABEL[e.target.value as LeaveType].toLowerCase()}`)}>{(Object.keys(TYPE_LABEL) as LeaveType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
            <label className="lv-daterow"><span>Rehire</span><select className="f" value={d.rehire ?? "unsure"} onChange={(e) => upd({ rehire: e.target.value as Departure["rehire"] })}><option value="unsure">Not sure</option><option value="yes">Eligible</option><option value="no">Not eligible</option></select></label>
            <label className="f">Personal email<input className="f" type="email" defaultValue={d.personalEmail ?? ""} onBlur={(e) => e.target.value.trim().toLowerCase() !== (d.personalEmail ?? "") && upd({ personalEmail: e.target.value.trim().toLowerCase() || undefined })} /></label>
            <div className="ob-roster small">
              {d.rosterRemovedAt ? <span>✓ Off the team roster {shortDate(d.rosterRemovedAt.slice(0, 10))}</span> : <><span className="muted">Comes off the team roster the day after their last day.</span> <button className="linklike" onClick={offRoster}>Do it now</button></>}
            </div>
            {d.status === "planned" ? (
              <button className="linklike tiny" style={{ marginTop: 8 }} onClick={() => confirm(`Cancel ${d.name}'s offboarding? (For example, they decided to stay.) Nothing else will go out.`) && upd({ status: "cancelled", email: { ...d.email, auto: false } }, "Cancelled", "Offboarding cancelled")}>They&apos;re staying: cancel this</button>
            ) : d.status === "cancelled" ? (
              <button className="linklike tiny" style={{ marginTop: 8 }} onClick={() => upd({ status: "planned" }, "Reopened", "Offboarding reopened")}>Reopen</button>
            ) : null}
          </div>

          <div className="card section">
            <h3 className="lv-h">Goodbye email</h3>
            <p className="small" style={{ marginTop: 0 }}>
              {d.email.sentAt ? <>✓ Sent {fmtTime(d.email.sentAt)} to {d.email.to}</> : scheduled ? <>Goes out on its own <b>{shortDate(sendOn(d, o))}</b> to {d.personalEmail || (d.workEmail ? <>{d.workEmail} <span style={{ color: "var(--amber)" }}>(work email: add a personal one in case access is off by then)</span></> : <span style={{ color: "var(--amber)" }}>no email yet</span>)}.</> : <span className="muted">Not scheduled. Send it when you&apos;re ready.</span>}
            </p>
            {!d.email.sentAt && d.status === "planned" && o.autoSend && (
              <label className="lv-check"><input type="checkbox" checked={d.email.auto} onChange={(e) => upd({ email: { ...d.email, auto: e.target.checked } }, e.target.checked ? "Will send on schedule" : "Won't send on its own")} /> Send on schedule</label>
            )}
            <label className="f">Personal note <span className="tiny muted">(optional, just for {d.name.split(" ")[0]})</span><textarea className="f" style={{ minHeight: 70 }} defaultValue={d.email.extra ?? ""} onBlur={(e) => e.target.value.trim() !== (d.email.extra ?? "") && upd({ email: { ...d.email, extra: e.target.value.trim() || undefined } })} /></label>
            <div className="sheet-actions" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => setPreview(true)}>{d.email.sentAt ? "View / send again" : "Preview & send"}</button>
            </div>
          </div>

          <div className="card section">
            <h3 className="lv-h">History</h3>
            <div className="lv-hist">
              {[...d.history].reverse().map((h, i) => (
                <div key={i}><span className="tiny muted">{fmtTime(h.at)}</span><span className="small"><b>{h.by}</b> {h.text}</span></div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {preview && (
        <Sheet title="Goodbye email" onClose={() => setPreview(false)}>
          <div className="tiny muted">To: {d.personalEmail || d.workEmail || "(no email yet)"} · <b>Subject:</b> {mail.subject}</div>
          <p className="tiny muted" style={{ margin: "4px 0 8px" }}>Change the wording for everyone under Email &amp; checklist, or add a personal note on this page.</p>
          <iframe className="email-frame" title="Goodbye email preview" srcDoc={fit(mail.html)} sandbox="" />
          <div className="sheet-actions">
            <button className="btn" disabled={!!busy} onClick={() => send(true)}>{busy === "test" ? "Sending…" : "Send me a test"}</button>
            <button className="btn primary" disabled={!!busy} onClick={() => send(false)}>{busy === "send" ? "Sending…" : d.email.sentAt ? "Send again" : "Send now"}</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
