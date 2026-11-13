"use client";

// New hires: the tracker. Every hire on one screen, with this company's steps as columns.
// Tap a circle to mark a step done, tap a name for notes and outcome. Steps are set per company.
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, useGuard } from "@/components/ui";
import { addDaysISO, daysUntil, Hire, onboardingFor, shortDate } from "@/lib/hires";
import { newId } from "@/lib/hiretasks";
import { useStore } from "@/lib/store";
import { Bucket, bucket, defaultSteps, newStepId, Outcome, outcomeLabel, OUTCOMES, progress, readImport, remarkNote, shortLabel, stepDone, stepsFor, TrackerStep } from "@/lib/tracker";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const md = (iso: string) => {
  if (!iso || iso === "auto") return "";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}/${d}`;
};
const startsIn = (iso: string) => {
  if (!iso) return "No date";
  const n = daysUntil(iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n > 1) return `In ${n} days`;
  return n >= -60 ? `${-n} days in` : "Started";
};

/** Notes plus the automated emails, newest last: "Welcome email sent", "First-day email sent", reminders. */
function timeline(h: Hire, steps: TrackerStep[]): { at: string; by: string; text: string; auto?: boolean }[] {
  const out: { at: string; by: string; text: string; auto?: boolean }[] = [...(h.remarks ?? [])];
  const e = h.emails ?? {};
  const ok = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}/.test(v);
  if (ok(e.welcome)) out.push({ at: e.welcome!, by: "", text: "Welcome email sent", auto: true });
  if (ok(e.firstDay)) out.push({ at: e.firstDay!, by: "", text: "First-day email sent", auto: true });
  for (const st of steps) {
    const v = e[`step:${st.id}`] || (st.id === "day30" ? e.checkIn : undefined);
    if (ok(v)) out.push({ at: v!, by: "", text: `${st.label} reminder sent`, auto: true });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export default function HiresPage() {
  return (
    <Suspense fallback={null}>
      <Hires />
    </Suspense>
  );
}

function Hires() {
  const { client: clientId } = useParams<{ client: string }>();
  const q = useSearchParams();
  const ok = useGuard("client", clientId);
  const { getClient, hires, config, viewer, me, who, updateHire, patch } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const s = onboardingFor(cfg?.onboarding);
  const steps = stepsFor(s);
  const [tab, setTab] = useState<Bucket>("active");
  const [loc, setLoc] = useState("");
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayISO()), []);
  useEffect(() => {
    const o = q.get("open");
    if (o) setOpen(o);
  }, [q]);

  const mine = useMemo(() => hires.filter((h) => h.clientId === clientId), [hires, clientId]);
  const locs = useMemo(() => [...new Set(mine.map((h) => (h.location || "").trim()).filter(Boolean))].sort(), [mine]);
  const counts = useMemo(() => {
    const c = { active: 0, done: 0, out: 0 } as Record<Bucket, number>;
    for (const h of mine) c[bucket(h, steps)]++;
    return c;
  }, [mine, steps]);

  if (!ok || !client) return null;
  if (!cfg?.modules.hires)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">New hires isn&apos;t turned on for this workspace.</div></main>
      </div>
    );

  const isAdvisor = viewer?.kind === "advisor";
  const canEdit = isAdvisor || me?.access === "exec";
  const f = find.trim().toLowerCase();
  const list = mine
    .filter((h) => bucket(h, steps) === tab)
    .filter((h) => !loc || (h.location || "").trim() === loc)
    .filter((h) => !f || [h.name, h.title, h.managerName].some((x) => (x || "").toLowerCase().includes(f)))
    .sort((a, b) => (tab === "active" ? (a.startDate || "9999").localeCompare(b.startDate || "9999") : (b.startDate || "").localeCompare(a.startDate || "")));
  const week = today ? mine.filter((h) => bucket(h, steps) === "active" && h.startDate >= today && h.startDate <= addDaysISO(today, 7)).length : 0;

  const toggle = (h: Hire, st: TrackerStep) => {
    if (!canEdit) return;
    const was = stepDone(h, st.id);
    updateHire(h.id, (x) => ({ track: { ...(x.track ?? {}), [st.id]: was ? "" : todayISO() } }), was ? `Tracker: ${st.label} unmarked` : `Tracker: ${st.label} done`);
  };

  const openHire = mine.find((h) => h.id === open);

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        <div className="row" style={{ alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <h1 style={{ margin: 0 }}>New hires</h1>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {counts.active} in progress{week ? ` · ${week} start${week === 1 ? "s" : ""} this week` : ""}
            </p>
          </div>
          {canEdit && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => setEditing(true)}>Edit steps</button>
              <button className="btn sm" onClick={() => setImporting(true)}>Import</button>
              <Link href={`/c/${clientId}/hires/new`} className="btn primary sm">+ New hire</Link>
            </div>
          )}
        </div>

        <div className="nt-bar section">
          <div className="pr-tabs" role="tablist">
            <button className={tab === "active" ? "on" : ""} onClick={() => setTab("active")}>In progress <span className="muted">{counts.active}</span></button>
            <button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>Done <span className="muted">{counts.done}</span></button>
            <button className={tab === "out" ? "on" : ""} onClick={() => setTab("out")}>Didn&apos;t start <span className="muted">{counts.out}</span></button>
          </div>
          <div className="nt-filters">
            {locs.length > 1 && (
              <div className="nt-locs">
                <button className={!loc ? "on" : ""} onClick={() => setLoc("")}>All</button>
                {locs.map((l) => <button key={l} className={loc === l ? "on" : ""} onClick={() => setLoc(l)}>{l}</button>)}
              </div>
            )}
            {mine.length > 8 && <input className="nt-find" placeholder="Search" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search new hires" />}
          </div>
        </div>

        {!list.length ? (
          <div className="card small muted section">
            {tab === "active" ? (mine.length ? "No one in progress." : `No new hires yet.${canEdit ? " Tap New hire to start one, or Import to bring in your current tracker." : ""}`) : tab === "done" ? "No one has finished every step yet." : "No one here."}
          </div>
        ) : (
          <>
            <div className="nt-wrap section">
              <table className="nt" style={{ ["--steps" as string]: steps.length }}>
                <thead>
                  <tr>
                    <th className="nt-who">Employee</th>
                    <th className="nt-mgr">Manager</th>
                    <th className="nt-start">Start</th>
                    {steps.map((st) => (
                      <th key={st.id} className="nt-step" scope="col">
                        <span className="nt-step-l">{st.label}</span>
                        {st.days ? <span className="nt-step-d" title={`Emails HR and the manager on day ${st.days} if not done`}>Day {st.days} email</span> : null}
                      </th>
                    ))}
                    <th className="nt-note">Latest note</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((h) => {
                    const tl = timeline(h, steps);
                    const last = tl[tl.length - 1];
                    const n = h.startDate ? daysUntil(h.startDate) : null;
                    return (
                      <tr key={h.id}>
                        <td className="nt-who">
                          <button className="nt-name" onClick={() => setOpen(h.id)}>{h.name || "Unnamed hire"}</button>
                          <div className="tiny muted">{[h.title, h.location].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="nt-mgr small">{h.managerName || <span className="muted">-</span>}</td>
                        <td className="nt-start">
                          <div className="small" style={{ fontWeight: 600 }}>{h.startDate ? shortDate(h.startDate) : "TBD"}</div>
                          <div className={`tiny ${n !== null && n >= 0 && n <= 7 && tab === "active" ? "nt-soon" : "muted"}`}>{h.outcome ? outcomeLabel(h.outcome) : startsIn(h.startDate)}</div>
                        </td>
                        {steps.map((st) => (
                          <td key={st.id} className="nt-step">
                            <Dot h={h} st={st} canEdit={canEdit} onClick={() => toggle(h, st)} />
                          </td>
                        ))}
                        <td className="nt-note small">
                          {last ? (
                            <button className={`nt-notebtn ${last.auto ? "auto" : ""}`} onClick={() => setOpen(h.id)}><span className="muted">{md(last.at)}</span> {last.auto && <span aria-hidden="true">✉ </span>}{last.text}</button>
                          ) : canEdit ? (
                            <button className="nt-notebtn muted" onClick={() => setOpen(h.id)}>+ Add note</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="nt-cards section">
              {list.map((h) => {
                const tl = timeline(h, steps);
                const last = tl[tl.length - 1];
                const n = h.startDate ? daysUntil(h.startDate) : null;
                return (
                  <article key={h.id} className="card nt-card">
                    <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                      <button className="nt-name grow" onClick={() => setOpen(h.id)}>
                        <span className="hire-name">{h.name || "Unnamed hire"}</span>
                        <span className="small muted" style={{ display: "block", fontWeight: 400 }}>{[h.title, h.location, h.managerName].filter(Boolean).join(" · ")}</span>
                      </button>
                      <div style={{ textAlign: "right" }}>
                        <div className="small" style={{ fontWeight: 600 }}>{h.startDate ? shortDate(h.startDate) : "TBD"}</div>
                        <div className={`tiny ${n !== null && n >= 0 && n <= 7 && tab === "active" ? "nt-soon" : "muted"}`}>{h.outcome ? outcomeLabel(h.outcome) : startsIn(h.startDate)}</div>
                      </div>
                    </div>
                    <div className="nt-card-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
                      {steps.map((st) => (
                        <div key={st.id}>
                          <Dot h={h} st={st} canEdit={canEdit} onClick={() => toggle(h, st)} />
                          <span>{shortLabel(st.label)}</span>
                        </div>
                      ))}
                    </div>
                    {last && <div className={`small ${last.auto ? "nt-auto" : ""}`}><span className="muted">{md(last.at)}</span> {last.auto && <span aria-hidden="true">✉ </span>}{last.text}</div>}
                  </article>
                );
              })}
            </div>
          </>
        )}
        {!canEdit && mine.length > 0 && <p className="tiny muted section">Your HR admin keeps this up to date.</p>}
      </main>

      {openHire && <HirePanel h={openHire} steps={steps} canEdit={canEdit} who={who} clientId={clientId} onClose={() => setOpen(null)} toggle={(st) => toggle(openHire, st)} update={updateHire} />}
      {editing && (
        <StepsEditor
          steps={steps}
          payroll={s.payroll}
          onClose={() => setEditing(false)}
          onSaved={(onboarding) => patch({ config: { ...config, [clientId]: { ...cfg, onboarding } } })}
          clientId={clientId}
          base={cfg.onboarding ?? {}}
        />
      )}
      {importing && <ImportSheet steps={steps} existing={mine} onClose={() => setImporting(false)} onAdd={(add) => patch({ hires: [...hires, ...add] })} clientId={clientId} who={who} />}
    </div>
  );
}

function Dot({ h, st, canEdit, onClick }: { h: Hire; st: TrackerStep; canEdit: boolean; onClick: () => void }) {
  const d = stepDone(h, st.id);
  const due = !d && st.days && h.startDate ? addDaysISO(h.startDate, st.days) : "";
  const title = d ? `${st.label}: done${md(d) ? ` ${md(d)}` : ""}` : due ? `${st.label}: due ${md(due)}` : `${st.label}: not done`;
  const cls = `nt-dot ${d ? "done" : ""}`;
  if (!canEdit) return <span className={cls} title={title} aria-label={title}>{d ? "✓" : ""}</span>;
  return (
    <button className={cls} title={title} aria-label={title} aria-pressed={!!d} onClick={onClick}>
      {d ? "✓" : ""}
    </button>
  );
}

function HirePanel({ h, steps, canEdit, who, clientId, onClose, toggle, update }: { h: Hire; steps: TrackerStep[]; canEdit: boolean; who: string; clientId: string; onClose: () => void; toggle: (st: TrackerStep) => void; update: ReturnType<typeof useStore>["updateHire"] }) {
  const [note, setNote] = useState("");
  const p = progress(h, steps);
  const tl = timeline(h, steps);
  const add = () => {
    const t = note.trim();
    if (!t) return;
    update(h.id, (x) => ({ remarks: [...(x.remarks ?? []), { at: new Date().toISOString(), by: who, text: t.slice(0, 300) }] }));
    setNote("");
  };
  const setOutcome = (o: Outcome | undefined) => update(h.id, { outcome: o }, o ? `Marked ${outcomeLabel(o)}` : "Back in progress");
  return (
    <Sheet title={h.name || "New hire"} onClose={onClose}>
      <div className="nt-panel">
        <p className="small muted" style={{ marginTop: 0 }}>
          {[h.title, h.managerName && `reports to ${h.managerName}`, h.location].filter(Boolean).join(" · ")}
          <br />
          Starts {h.startDate ? shortDate(h.startDate) : "TBD"} · {p.done} of {p.total} steps done
        </p>
        <ul className="nt-checks">
          {steps.map((st) => {
            const d = stepDone(h, st.id);
            const due = st.days && h.startDate ? addDaysISO(h.startDate, st.days) : "";
            return (
              <li key={st.id}>
                <label className={canEdit ? "" : "ro"}>
                  <input type="checkbox" checked={!!d} disabled={!canEdit} onChange={() => toggle(st)} />
                  <span className="grow">{st.label}</span>
                  <span className="tiny muted">{d ? (md(d) ? `Done ${md(d)}` : "Done") : due ? `Reminder ${md(due)}` : ""}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <h4 className="nt-h">Notes</h4>
        {tl.length ? (
          <ul className="nt-notes">
            {[...tl].reverse().map((r, i) => (
              <li key={i} className={r.auto ? "nt-auto" : ""}><span className="tiny muted">{md(r.at)}{r.by ? ` · ${r.by.split(" ")[0]}` : ""}</span> {r.auto && <span aria-hidden="true">✉ </span>}{r.text}</li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No notes yet.</p>
        )}
        {canEdit && (
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <input className="grow" value={note} placeholder="Pending drug test, consent forms sent…" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Add a note" />
            <button className="btn sm" onClick={add} disabled={!note.trim()}>Add</button>
          </div>
        )}

        {canEdit && (
          <>
            <h4 className="nt-h">Didn&apos;t start?</h4>
            {h.outcome ? (
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className="pill soon">{outcomeLabel(h.outcome)}</span>
                <button className="btn sm" onClick={() => setOutcome(undefined)}>Move back to in progress</button>
              </div>
            ) : (
              <div className="nt-outcomes">
                {OUTCOMES.map((o) => <button key={o.id} className="btn sm" onClick={() => setOutcome(o.id)}>{o.label}</button>)}
              </div>
            )}
          </>
        )}
      </div>
      <div className="sheet-actions">
        <Link href={`/c/${clientId}/hires/${h.id}`} className="btn sm">Offer, emails &amp; details</Link>
        <button className="btn primary sm" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

function StepsEditor({ steps, payroll, onClose, onSaved, clientId, base }: { steps: TrackerStep[]; payroll: string; onClose: () => void; onSaved: (o: Record<string, unknown>) => void; clientId: string; base: Record<string, unknown> }) {
  const [list, setList] = useState<TrackerStep[]>(steps.map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (i: number, c: Partial<TrackerStep>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const move = (i: number, d: number) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const save = async (next: TrackerStep[]) => {
    const clean = next.map((x) => ({ ...x, label: x.label.trim() })).filter((x) => x.label);
    if (!clean.length) return setErr("Keep at least one step.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/hire-steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, steps: clean }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) onSaved(j.onboarding);
      else if (j.reason === "demo") onSaved({ ...base, trackerSteps: clean });
      else if (j.reason === "preview") return setErr("Preview is read-only.");
      else return setErr("Couldn't save. Try again.");
      onClose();
    } catch {
      setErr("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Edit steps" onClose={onClose}>
      <div className="nt-panel">
        <p className="small muted" style={{ marginTop: 0 }}>These are the columns on your tracker. Add a day count to email HR and the manager that many days after the start date if the step isn&apos;t done yet.</p>
        <ol className="nt-edit">
          {list.map((st, i) => (
            <li key={st.id}>
              <span className="nt-edit-n">{i + 1}</span>
              <input value={st.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Step ${i + 1} name`} />
              <label className="nt-edit-days">
                <span className="tiny muted">Remind at</span>
                <input type="number" min={1} max={365} inputMode="numeric" value={st.days ?? ""} placeholder="-" onChange={(e) => set(i, { days: e.target.value ? Number(e.target.value) : null })} aria-label={`Reminder days for ${st.label}`} />
                <span className="tiny muted">days</span>
              </label>
              <span className="nt-edit-btns">
                <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="btn sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down">↓</button>
                <button className="btn sm" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${st.label}`}>×</button>
              </span>
            </li>
          ))}
        </ol>
        {list.length < 12 && <button className="btn sm" onClick={() => setList((l) => [...l, { id: newStepId("step"), label: "", days: null }])}>+ Add a step</button>}
        <p className="tiny muted" style={{ marginTop: 10 }}>Removing a step hides its column. Checkmarks already made come back if you add it again with the same name.</p>
        {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      </div>
      <div className="sheet-actions">
        <button className="btn sm" style={{ marginRight: "auto" }} onClick={() => setList(defaultSteps(payroll))} disabled={busy}>Reset to defaults</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" onClick={() => save(list)} disabled={busy}>{busy ? "Saving…" : "Save steps"}</button>
      </div>
    </Sheet>
  );
}

function ImportSheet({ steps, existing, onClose, onAdd, clientId, who }: { steps: TrackerStep[]; existing: Hire[]; onClose: () => void; onAdd: (h: Hire[]) => void; clientId: string; who: string }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const today = todayISO();
  const res = useMemo(() => (text.trim() ? readImport(text, steps, today) : null), [text, steps, today]);
  const key = (n: string, d: string) => `${n.trim().toLowerCase()}|${d}`;
  const have = new Set(existing.map((h) => key(h.name, h.startDate)));
  const fresh = (res?.rows ?? []).filter((r) => !have.has(key(r.name, r.startDate)));
  const tally = fresh.reduce(
    (a, r) => {
      const b = r.outcome ? "out" : steps.every((s) => r.track[s.id]) ? "done" : "active";
      a[b]++;
      return a;
    },
    { active: 0, done: 0, out: 0 } as Record<Bucket, number>
  );
  const file = async (f?: File) => {
    if (!f) return;
    if (f.size > 2e6) return;
    setText(await f.text());
  };
  const go = () => {
    const now = new Date().toISOString();
    const add: Hire[] = fresh.map((r) => {
      const amt = Number(r.pay.replace(/[^0-9.]/g, ""));
      const note = remarkNote(r.remarks, r.startDate, today);
      return {
        id: newId("h"),
        clientId,
        status: r.startDate && r.startDate <= today ? "Started" : "Offer signed",
        title: r.title,
        managerName: r.managerName,
        managerTitle: "",
        name: r.name,
        personalEmail: r.personalEmail,
        cell: r.cell || undefined,
        payType: amt && amt < 500 ? "hourly" : "salary",
        payAmount: amt || "",
        exempt: amt && amt < 500 ? "nonexempt" : "exempt",
        startDate: r.startDate,
        location: r.location || undefined,
        track: r.track,
        outcome: r.outcome,
        remarks: note ? [{ at: note.at, by: "", text: note.text }] : [],
        imported: true,
        emails: { welcome: "imported", firstDay: "imported" },
        createdAt: now,
        history: [{ at: now, by: who, text: "Imported from the new hire tracker spreadsheet" }],
      } as Hire;
    });
    onAdd(add);
    setDone(add.length);
  };
  if (done !== null)
    return (
      <Sheet title="Imported" onClose={onClose}>
        <p className="small">Added {done} {done === 1 ? "person" : "people"} to the tracker. No emails go out for imported hires, and they aren&apos;t added to the team roster.</p>
        <div className="sheet-actions"><button className="btn primary sm" onClick={onClose}>Done</button></div>
      </Sheet>
    );
  return (
    <Sheet title="Import your tracker" onClose={onClose}>
      <div className="nt-panel">
        <p className="small muted" style={{ marginTop: 0 }}>Copy the sheet in Excel or Google Sheets (header row included) and paste it here, or choose a .csv file. Columns like Employee Name, Manager, Start Date, Remarks and your step columns are matched by name.</p>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here" aria-label="Paste the spreadsheet" style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
        <label className="btn sm" style={{ marginTop: 8, display: "inline-flex" }}>
          Choose a file
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" hidden onChange={(e) => file(e.target.files?.[0])} />
        </label>
        {res && (
          <div className="card nt-preview">
            {fresh.length ? (
              <p className="small" style={{ margin: 0 }}>
                <b>{fresh.length}</b> to add: {tally.active} in progress, {tally.done} done, {tally.out} didn&apos;t start.
                {res.rows.length > fresh.length ? ` ${res.rows.length - fresh.length} already here, skipped.` : ""}
              </p>
            ) : (
              <p className="small" style={{ margin: 0 }}>{res.rows.length ? "Everyone in this sheet is already on the tracker." : "No rows with a name found. Include the header row."}</p>
            )}
            {res.mapped.length > 0 && <p className="tiny muted" style={{ margin: "6px 0 0" }}>Using: {res.mapped.join(", ")}</p>}
            {res.unmapped.length > 0 && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Not used: {res.unmapped.join(", ")}</p>}
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>People who started more than 45 days ago, or whose note says onboarding is complete, go to Done. Notes like declined, rescinded or no show go to Didn&apos;t start.</p>
          </div>
        )}
      </div>
      <div className="sheet-actions">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" onClick={go} disabled={!fresh.length}>Import {fresh.length || ""}</button>
      </div>
    </Sheet>
  );
}
