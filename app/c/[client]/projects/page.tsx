"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { addBusinessDays, fmt, parseDay, Project, projectProgress, toISO, today } from "@/lib/data";
import { useStore } from "@/lib/store";

type Tab = "active" | "planned" | "done";

export default function Projects() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, projects, actions, patch, viewer, live } = useStore();
  const client = getClient(clientId);
  const [tab, setTab] = useState<Tab>("active");
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<Project | null>(null);
  const toast = useToast();
  if (!ok || !client) return null;

  const isAdvisor = viewer?.kind === "advisor";
  const mine = projects.filter((p) => p.clientId === client.id);
  const by = (s: Tab) => mine.filter((p) => p.status === s).sort((a, b) => (s === "done" ? b.milestoneDue.localeCompare(a.milestoneDue) : a.milestoneDue.localeCompare(b.milestoneDue)));
  const setP = (id: string, p: Partial<Project>) => patch({ projects: projects.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  const planned = by("planned");
  const months: Record<string, Project[]> = {};
  planned.forEach((p) => {
    const k = parseDay(p.milestoneDue).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    (months[k] ||= []).push(p);
  });

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <h1>Projects</h1>
            <p className="muted" style={{ marginTop: 6 }}>What's underway, what's coming, and what's done.</p>
          </div>
          {isAdvisor && <button className="btn primary" onClick={() => setAdding(true)}>Add</button>}
        </div>

        <div className="kpis section" style={{ marginTop: 16, gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="kpi"><div className="n">{by("active").length}</div><div className="l">In progress</div></div>
          <div className="kpi"><div className="n">{planned.length}</div><div className="l">On the roadmap</div></div>
          <div className="kpi"><div className="n">{by("done").length}</div><div className="l">Completed</div></div>
        </div>

        <div className="tabs section" style={{ marginTop: 16 }}>
          {([["active", "In progress"], ["planned", "HR roadmap"], ["done", "Completed"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {l}<span className="count">{by(k).length}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {tab === "active" &&
            by("active").map((p) => {
              const pct = projectProgress(p);
              const waiting = actions.filter((a) => a.projectId === p.id && a.status !== "completed");
              return (
                <div className="card" key={p.id}>
                  <div className="row" style={{ alignItems: "baseline" }}>
                    <h3>{p.name}</h3>
                    <span className="small muted">{pct}%</span>
                  </div>
                  <p className="small muted" style={{ marginTop: 4 }}>{p.summary}</p>
                  {isAdvisor && <button className="linklike tiny" style={{ color: "var(--red)", marginTop: 4 }} onClick={() => setDel(p)}>Delete project</button>}
                  <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                  <div style={{ marginTop: 8 }}>
                    {p.steps.map((s) => (
                      <label key={s.id} className={`check ${s.done ? "done" : ""}`} style={{ cursor: isAdvisor ? "pointer" : "default" }}>
                        <input
                          type="checkbox"
                          checked={s.done}
                          disabled={!isAdvisor}
                          onChange={() => setP(p.id, { steps: p.steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}
                        />
                        <span>{s.text}</span>
                      </label>
                    ))}
                  </div>
                  {waiting.length > 0 && (
                    <div className="tiny muted" style={{ marginTop: 8 }}>
                      Open items: {waiting.map((w) => `${w.title} (${w.side === "alza" ? "Alza" : w.owner.name})`).join(" · ")}
                    </div>
                  )}
                  <div className="action-foot">
                    <span className="tiny muted">Next: {p.nextMilestone} · target {fmt(p.milestoneDue)}</span>
                    {isAdvisor && pct === 100 && (
                      <button className="btn sm primary" style={{ marginLeft: "auto" }} onClick={() => { setP(p.id, { status: "done", milestoneDue: toISO(today()) }); toast.show("Moved to Completed"); }}>
                        Mark complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {tab === "planned" && (
            <>
              {planned.length === 0 && <div className="card small muted">Nothing on the roadmap yet.</div>}
              {Object.entries(months).map(([m, list]) => (
                <div key={m}>
                  <div className="roadmap-month">{m}</div>
                  {list.map((p) => (
                    <div className="card" key={p.id}>
                      <div className="row" style={{ alignItems: "flex-start" }}>
                        <div className="grow">
                          <h3>{p.name}</h3>
                          <p className="small muted" style={{ marginTop: 4 }}>{p.summary}</p>
                  {isAdvisor && <button className="linklike tiny" style={{ color: "var(--red)", marginTop: 4 }} onClick={() => setDel(p)}>Delete project</button>}
                        </div>
                        <span className="pill later">Starts {fmt(p.milestoneDue)}</span>
                      </div>
                      {isAdvisor && (
                        <div className="action-foot">
                          <button
                            className="btn sm"
                            onClick={() => {
                              setP(p.id, {
                                status: "active",
                                steps: p.steps.length ? p.steps : [{ id: "k1", text: "Kickoff", done: false }, { id: "k2", text: "Draft", done: false }, { id: "k3", text: "Client review", done: false }, { id: "k4", text: "Roll out", done: false }],
                                nextMilestone: "Kickoff",
                              });
                              toast.show("Moved to In progress");
                            }}
                          >
                            Start now
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {tab === "done" &&
            by("done").map((p) => (
              <div className="card" key={p.id}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <h3>{p.name}</h3>
                    <p className="small muted" style={{ marginTop: 4 }}>{p.summary}</p>
                  {isAdvisor && <button className="linklike tiny" style={{ color: "var(--red)", marginTop: 4 }} onClick={() => setDel(p)}>Delete project</button>}
                  </div>
                  <span className="pill done">Done {fmt(p.milestoneDue)}</span>
                </div>
              </div>
            ))}
        </div>
        {!live && <p className="demo-note">Sample projects for the prototype.</p>}
      </main>

      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onAdd={(name, summary, date, steps, active) => {
            const st = steps.map((text, i) => ({ id: `st${i}`, text, done: false }));
            patch({ projects: [...projects, { id: `p${Date.now().toString(36)}`, clientId: client.id, name, summary, status: active ? "active" : "planned", steps: st, nextMilestone: st[0]?.text ?? "Kickoff", milestoneDue: date }] });
            setAdding(false);
            setTab(active ? "active" : "planned");
            toast.show(active ? "Project started" : "Added to the roadmap");
          }}
        />
      )}
      {del && (
        <Sheet title={`Delete ${del.name}?`} onClose={() => setDel(null)}>
          <p className="small">This removes the project and its steps for everyone. Tasks linked to it stay, just without the project. It can&apos;t be undone.</p>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setDel(null)}>Cancel</button>
            <button
              className="btn sm"
              style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }}
              onClick={() => {
                const d = del;
                setDel(null);
                patch({ projects: projects.filter((x) => x.id !== d.id), actions: actions.map((a) => (a.projectId === d.id ? { ...a, projectId: undefined } : a)) });
                toast.show("Project deleted");
              }}
            >
              Delete
            </button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

function AddSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (n: string, s: string, d: string, steps: string[], active: boolean) => void }) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(toISO(addBusinessDays(today(), 20)));
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState("");
  return (
    <Sheet title="Add a project" onClose={onClose}>
      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0 }}>
        <button className={!active ? "on" : ""} onClick={() => setActive(false)}>On the roadmap</button>
        <button className={active ? "on" : ""} onClick={() => setActive(true)}>Starting now</button>
      </div>
      <label className="f">Project</label>
      <input className="f" value={name} onChange={(e) => setName(e.target.value)} placeholder="Benefits renewal" />
      <label className="f">One-line summary</label>
      <input className="f" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <label className="f">{active ? "Target finish" : "Target start"}</label>
      <input className="f" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="f">Steps (one per line, these drive the % complete)</label>
      <textarea className="f" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"Kickoff\nDraft\nClient review\nRoll out"} />
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!name.trim()} onClick={() => onAdd(name.trim(), summary.trim(), date, steps.split("\n").map((x) => x.trim()).filter(Boolean), active)}>Add</button>
      </div>
    </Sheet>
  );
}
