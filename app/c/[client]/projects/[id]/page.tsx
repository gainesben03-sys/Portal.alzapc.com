"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AskBenSheet } from "@/components/askben";
import { EditProjectSheet } from "@/components/projectedit";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { currentStep, HealthChip, ProgressChart, ProgressRing, projectHealth, StepTrack } from "@/components/projectprogress";
import { dueLabel, fmt, Project, projectProgress, toISO, today } from "@/lib/data";
import { useStore } from "@/lib/store";

/** One project's progress: how far along, what's happening now, and whether it'll land on time. */
export default function ProjectProgressPage() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, projects, actions, patch, viewer, rules } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [editingP, setEditingP] = useState(false);
  if (!ok || !client) return null;
  const p = projects.find((x) => x.id === id && x.clientId === clientId);
  const isAdvisor = viewer?.kind === "advisor";

  if (!p)
    return (
      <div style={{ ["--accent" as string]: client.accent }}>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">This project isn&apos;t here anymore. <Link href={`/c/${clientId}/projects`}>Back to Projects</Link></div></main>
      </div>
    );

  const setP = (patchP: Partial<Project>) => patch({ projects: projects.map((x) => (x.id === p.id ? { ...x, ...patchP } : x)) });
  const pct = projectProgress(p);
  const items = actions.filter((a) => a.projectId === p.id);
  const openItems = items.filter((a) => a.status !== "completed").sort((a, b) => a.due.localeCompare(b.due));
  const h = projectHealth(p, items, rules);
  const cur = currentStep(p);
  const doneCount = p.steps.filter((s) => s.done).length;

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <Link href={`/c/${clientId}/projects`} className="small" style={{ color: "var(--blue)" }}>← Projects</Link>
        {isAdvisor && <button className="btn sm" style={{ float: "right", marginTop: 6 }} onClick={() => setEditingP(true)}>Edit project</button>}
        <h1 style={{ marginTop: 10 }}>{p.name}</h1>
        {p.summary && <p className="muted" style={{ marginTop: 4 }}>{p.summary}</p>}

        <div className="card section proj-hero">
          <ProgressRing pct={pct} />
          <div className="grow" style={{ minWidth: 0 }}>
            <HealthChip h={h} />
            <p className="small" style={{ margin: "6px 0 0" }}>{h.why}</p>
            <div className="proj-facts">
              <div><span className="tiny muted">Steps</span><b>{doneCount} of {p.steps.length}</b></div>
              <div><span className="tiny muted">{p.status === "done" ? "Finished" : p.status === "planned" ? "Starts" : "Target"}</span><b>{fmt(p.milestoneDue)}</b></div>
              {cur >= 0 && <div><span className="tiny muted">Now</span><b className="ellipsis">{p.steps[cur].text}</b></div>}
            </div>
          </div>
        </div>

        <div className="card section">
          <StepTrack p={p} />
          <ol className="pizza">
            {p.steps.map((s, i) => {
              const state = s.done ? "done" : i === cur ? "now" : "next";
              return (
                <li key={s.id} className={state}>
                  <span className="pizza-dot" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="pizza-title">{s.text}</div>
                    <div className="tiny muted">
                      {s.done ? (s.doneAt ? `Done ${fmt(s.doneAt.slice(0, 10))}` : "Done") : i === cur ? "In progress now" : i === cur + 1 ? "Up next" : "Coming up"}
                    </div>
                  </div>
                  {isAdvisor && p.status !== "planned" && (
                    <input
                      type="checkbox"
                      aria-label={`Mark "${s.text}" done`}
                      checked={s.done}
                      onChange={() => setP({ steps: p.steps.map((x) => (x.id === s.id ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : undefined } : x)) })}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {p.steps.length === 0 && <p className="small muted">Ben will add the steps when this kicks off.</p>}
          {isAdvisor && p.status === "active" && pct === 100 && (
            <div className="action-foot">
              <button className="btn sm primary" style={{ marginLeft: "auto" }} onClick={() => { setP({ status: "done", milestoneDue: toISO(today()) }); toast.show("Marked complete"); }}>Mark project complete</button>
            </div>
          )}
        </div>

        {p.status !== "planned" && (
          <div className="card section">
            <h3 style={{ margin: 0 }}>Progress over time</h3>
            <div className="tiny muted" style={{ marginTop: 4 }}><span className="legend-solid" style={{ marginLeft: 0 }} /> done so far <span className="legend-dash" /> pace to hit the target</div>
            <div style={{ marginTop: 10 }}><ProgressChart p={p} /></div>
          </div>
        )}

        <div className="section-head section">
          <h2>Open items</h2>
          {!isAdvisor && p.status !== "done" && <button className="btn sm" onClick={() => setAsking(true)}>Ask Ben about this</button>}
        </div>
        {openItems.length === 0 ? (
          <div className="card small muted">Nothing open on this project right now.</div>
        ) : (
          <div className="card">
            {openItems.map((a) => (
              <Link className="row" key={a.id} href={`/c/${clientId}/a/${a.id}`}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title ellipsis">{a.title}</div>
                  <div className="tiny muted">{a.side === "alza" ? "Ben" : a.owner.name} · {dueLabel(a)}</div>
                </div>
                <span className={`pill ${a.side === "alza" ? "alza" : "soon"}`}>{a.side === "alza" ? "Ben's" : isAdvisor ? "Client" : "Yours"}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      {editingP && (
        <EditProjectSheet
          p={p}
          onClose={() => setEditingP(false)}
          onSave={(next, note) => {
            patch({ projects: projects.map((x) => (x.id === p.id ? next : x)) });
            setEditingP(false);
            toast.show(note ? `Saved: ${note}` : "Saved");
          }}
        />
      )}
      {asking && <AskBenSheet clientId={client.id} projectId={p.id} onClose={() => setAsking(false)} onDone={(m) => { setAsking(false); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
