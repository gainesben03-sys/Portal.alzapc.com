"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionCard, ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { parseDay, urgency } from "@/lib/data";
import { useStore } from "@/lib/store";

type Tab = "you" | "team" | "alza" | "done";
const ORDER = { blocker: 0, overdue: 1, today: 2, soon: 3, later: 4, done: 5 } as const;

export default function Tasks() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { actions, rules, viewer, update, getClient } = useStore();
  const client = getClient(clientId);
  const [tab, setTab] = useState<Tab>("you");
  const toast = useToast();

  if (!ok || !client) return null;

  const meName = viewer?.kind === "client" ? viewer.person.name : null;
  const mine = actions.filter((a) => a.clientId === client.id);
  const sort = (l: typeof mine) =>
    [...l].sort(
      (a, b) => ORDER[urgency(a, rules)] - ORDER[urgency(b, rules)] || parseDay(a.due).getTime() - parseDay(b.due).getTime()
    );

  const openClient = mine.filter((a) => a.side === "client" && a.status !== "completed");
  const lists: Record<Tab, typeof mine> = {
    you: sort(openClient.filter((a) => !meName || a.owner.name === meName)),
    team: sort(openClient.filter((a) => meName && a.owner.name !== meName)),
    alza: sort(mine.filter((a) => a.side === "alza" && a.status !== "completed")),
    done: sort(mine.filter((a) => a.status === "completed")),
  };
  const overdueCount = openClient.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules))).length;
  const todayCount = openClient.filter((a) => urgency(a, rules) === "today").length;

  const tabs: [Tab, string][] = meName
    ? [["you", "Needs you"], ["team", "Your team"], ["alza", "Alza is on it"], ["done", "Done"]]
    : [["you", "Waiting on client"], ["alza", "Alza is on it"], ["done", "Done"]];

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Tasks</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {overdueCount > 0 ? <><span style={{ color: "var(--red)", fontWeight: 600 }}>{overdueCount} overdue</span>{todayCount > 0 && <> · <b>{todayCount} due today</b></>}</> : todayCount > 0 ? <b>{todayCount} due today</b> : "You're all caught up."}
        </p>

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
              {a.side === "client" && a.kind === "approval" && a.status !== "completed" && !a.subtasks?.some((x) => !x.done) && (
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

        <p className="demo-note">Fictional sample data for the prototype.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
