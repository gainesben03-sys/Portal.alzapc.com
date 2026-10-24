"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionCard, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { fmt, parseDay, urgency } from "@/lib/data";
import { clientById, useStore } from "@/lib/store";

type Tab = "you" | "team" | "alza" | "done";
const ORDER = { blocker: 0, overdue: 1, today: 2, soon: 3, later: 4, done: 5 } as const;

export default function Workspace() {
  const { client: clientId } = useParams<{ client: string }>();
  const client = clientById(clientId);
  const ok = useGuard("client", clientId);
  const { actions, projects, rules, viewer, update } = useStore();
  const [tab, setTab] = useState<Tab>("you");
  const toast = useToast();

  if (!ok || !client) return null;

  const me = viewer?.kind === "client" ? viewer.person.name : null;
  const mine = actions.filter((a) => a.clientId === client.id);
  const sort = (l: typeof mine) =>
    [...l].sort(
      (a, b) => ORDER[urgency(a, rules)] - ORDER[urgency(b, rules)] || parseDay(a.due).getTime() - parseDay(b.due).getTime()
    );

  const openClient = mine.filter((a) => a.side === "client" && a.status !== "completed");
  const lists: Record<Tab, typeof mine> = {
    you: sort(openClient.filter((a) => !me || a.owner.name === me)),
    team: sort(openClient.filter((a) => me && a.owner.name !== me)),
    alza: sort(mine.filter((a) => a.side === "alza" && a.status !== "completed")),
    done: sort(mine.filter((a) => a.status === "completed")),
  };
  const overdueCount = openClient.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules))).length;
  const todayCount = openClient.filter((a) => urgency(a, rules) === "today").length;
  const firstName = me?.split(" ")[0] ?? "Ben";

  const tabs: [Tab, string][] = me
    ? [["you", "Needs you"], ["team", "Your team"], ["alza", "Alza is on it"], ["done", "Done"]]
    : [["you", "Waiting on client"], ["alza", "Alza is on it"], ["done", "Done"]];

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <main className="wrap">
        <div className="hero">
          <h1>Hi {firstName}</h1>
          <p>
            {overdueCount > 0 && <span className="big">{overdueCount} overdue</span>}
            {overdueCount > 0 && todayCount > 0 && " · "}
            {todayCount > 0 && <b>{todayCount} due today</b>}
            {overdueCount + todayCount === 0 && "You're all caught up."}
            {overdueCount + todayCount > 0 && ` across ${client.name}. Most take under two minutes.`}
          </p>
        </div>

        <div className="tabs section" style={{ marginTop: 16 }}>
          {tabs.map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
              <span className="count">{lists[k].length}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {lists[tab].length === 0 && <div className="card muted small">Nothing here right now.</div>}
          {lists[tab].map((a) => (
            <ActionCard key={a.id} a={a} href={`/c/${client.id}/a/${a.id}`}>
              {a.side === "client" && a.kind === "approval" && a.status !== "completed" && (
                <button
                  className="btn sm primary"
                  onClick={() => {
                    update(a.id, { status: "completed" }, "Approved");
                    toast.show("Approved. Ben has been notified.");
                  }}
                >
                  Approve
                </button>
              )}
              {a.status === "extension_requested" && <span className="pill later">Extension requested</span>}
              {a.status === "blocked" && <span className="pill alza">Waiting on your team</span>}
            </ActionCard>
          ))}
        </div>

        <div className="section-head section">
          <h2>Projects</h2>
        </div>
        {projects
          .filter((p) => p.clientId === client.id)
          .map((p) => {
            const blockers = openClient.filter(
              (a) => a.projectId === p.id && ["overdue", "blocker", "today"].includes(urgency(a, rules))
            );
            return (
              <div className="card" key={p.id}>
                <div className="row" style={{ alignItems: "baseline" }}>
                  <h3>{p.name}</h3>
                  <span className="small muted">{p.progress}%</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${p.progress}%` }} />
                </div>
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  Next: {p.nextMilestone} · target {fmt(p.milestoneDue)}
                </div>
                {blockers.map((b) => (
                  <div className="blocked-by" key={b.id}>
                    Held up by: {b.title} ({b.owner.name})
                  </div>
                ))}
              </div>
            );
          })}
        <p className="demo-note">Fictional sample data for the prototype.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
