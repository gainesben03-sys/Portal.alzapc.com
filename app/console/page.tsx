"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NewTaskSheet } from "@/components/newtask";
import { ActionCard, AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { daysSince } from "@/lib/modules";
import { fmt, parseDay, urgency } from "@/lib/data";
import { useStore } from "@/lib/store";

const ORDER = { blocker: 0, overdue: 1, today: 2, soon: 3, later: 4, done: 5 } as const;

export default function Console() {
  const ok = useGuard("advisor");
  const { actions, rules, update, notes, candidates, roles, getClient, files, clients } = useStore();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const open = useMemo(() => actions.filter((a) => a.status !== "completed"), [actions]);
  const sort = (list: typeof actions) =>
    [...list].sort(
      (a, b) => ORDER[urgency(a, rules)] - ORDER[urgency(b, rules)] || parseDay(a.due).getTime() - parseDay(b.due).getTime()
    );

  const waiting = sort(open.filter((a) => a.side === "client"));
  const mine = sort(open.filter((a) => a.side === "alza"));
  const extensions = open.filter((a) => a.status === "extension_requested");
  const overdue = waiting.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules)));
  const dueSoon = waiting.filter((a) => ["today", "soon"].includes(urgency(a, rules)));
  const mineLate = mine.filter((a) => ["overdue", "blocker", "today"].includes(urgency(a, rules)));

  const newNotes = notes.filter((n) => n.status === "new");
  const awaiting = candidates.filter((c) => !c.decision);
  const newFiles = files.filter((f) => !f.reviewed);

  if (!ok) return null;

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <div className="hero row" style={{ alignItems: "flex-start" }}>
          <div>
          <h1>Good {greeting()}, Ben</h1>
          <p>
            {overdue.length > 0 ? (
              <>
                <span className="big">{overdue.length} client items overdue</span> across{" "}
                {new Set(overdue.map((a) => a.clientId)).size} clients.{" "}
              </>
            ) : (
              "Nothing overdue on the client side. "
            )}
            {mineLate.length > 0 && `${mineLate.length} of your own deliverables need attention.`}
          </p>
          </div>
          {clients.length > 0 && <button className="btn primary sm" onClick={() => setCreating(true)}>New request</button>}
        </div>

        <div className="kpis section" style={{ marginTop: 16 }}>
          <div className="kpi">
            <div className="n">{clients.length}</div>
            <div className="l">Active clients</div>
          </div>
          <div className={`kpi ${overdue.length ? "alert" : ""}`}>
            <div className="n">{overdue.length}</div>
            <div className="l">Client items overdue</div>
          </div>
          <div className="kpi">
            <div className="n">{dueSoon.length}</div>
            <div className="l">Client items due soon</div>
          </div>
          <div className="kpi">
            <div className="n">{mine.length}</div>
            <div className="l">You owe</div>
          </div>
        </div>

        <div className="grid2 section">
          <section>
            <div className="section-head">
              <h2>Waiting on clients</h2>

            </div>
            {waiting.map((a) => (
              <ActionCard key={a.id} a={a} href={hrefFor(a.clientId, a.id)} showClient>
                <button
                  className="btn sm"
                  onClick={() => {
                    update(a.id, {}, `Manual reminder sent to ${a.owner.name}`);
                    toast.show(`Reminder sent to ${a.owner.name}`);
                  }}
                >
                  Nudge now
                </button>
              </ActionCard>
            ))}
          </section>

          <aside>
            {(newNotes.length > 0 || awaiting.length > 0 || newFiles.length > 0) && (
              <div style={{ marginBottom: 22 }}>
                <div className="section-head">
                  <h2>Needs a look</h2>
                </div>
                <div className="card">
                  {newFiles.map((f) => (
                    <Link className="row" key={f.id} href="/console/files">
                      <div className="grow">
                        <div className="title ellipsis">{f.name}</div>
                        <div className="tiny muted ellipsis">{getClient(f.clientId)?.name} · shared by {f.by}{f.confidential ? " · confidential" : ""}</div>
                      </div>
                      <span className="pill alza">New file</span>
                    </Link>
                  ))}
                  {newNotes.map((n) => (
                    <Link className="row" key={n.id} href="/console/board">
                      <div className="grow">
                        <div className="title ellipsis">
                          {n.urgent && <span style={{ color: "var(--red)" }}>Urgent · </span>}
                          {n.kind} from {n.author.name}
                        </div>
                        <div className="tiny muted ellipsis">{getClient(n.clientId)?.name} · {n.text}</div>
                      </div>
                      <span className="pill alza">New note</span>
                    </Link>
                  ))}
                  {awaiting.map((c) => {
                    const role = roles.find((r) => r.id === c.roleId)!;
                    return (
                      <Link className="row" key={c.id} href={`/c/${role.clientId}/recruiting`}>
                        <div className="grow">
                          <div className="title ellipsis">{c.name} · {role.title}</div>
                          <div className="tiny muted">
                            Waiting on {role.hiringManager.name} for {daysSince(c.sentAt)} days
                            {c.otherOffers && <span style={{ color: "var(--red)" }}> · has other offers</span>}
                          </div>
                        </div>
                        <span className="pill soon">Feedback</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {extensions.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div className="section-head">
                  <h2>Extension requests</h2>
                </div>
                <div className="card">
                  {extensions.map((a) => (
                    <div className="row" key={a.id}>
                      <div className="grow">
                        <div className="title ellipsis">{a.title}</div>
                        <div className="tiny muted">
                          {a.owner.name} asks for {fmt(a.extension!.requested)}: {a.extension!.reason}
                        </div>
                      </div>
                      <button
                        className="btn sm primary"
                        onClick={() => {
                          update(
                            a.id,
                            { due: a.extension!.requested, status: "in_progress", extension: undefined },
                            `Extension approved. New due date ${fmt(a.extension!.requested)}`
                          );
                          toast.show("Extension approved");
                        }}
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="section-head">
              <h2>You owe</h2>
            </div>
            {mine.map((a) => (
              <ActionCard key={a.id} a={a} href={hrefFor(a.clientId, a.id)} showClient />
            ))}

            <div className="section-head section">
              <h2>Clients</h2>
              <Link href="/console/clients">Set up</Link>
            </div>
            <div className="card">
              {clients.map((b) => getClient(b.id)!).map((c) => {
                const cOpen = open.filter((a) => a.clientId === c.id && a.side === "client");
                const cLate = cOpen.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules)));
                return (
                  <div className="row" key={c.id}>
                    <span className="client-chip" style={{ background: c.accent }}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="grow">
                      <div className="title">{c.name}</div>
                      <div className="tiny muted">
                        {c.engagement} · {cOpen.length} open
                        {cLate.length > 0 && <span style={{ color: "var(--red)" }}> · {cLate.length} overdue</span>}
                      </div>
                    </div>
                    <Link className="btn sm" href={`/c/${c.id}`}>
                      Open
                    </Link>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
        <p className="demo-note">Fictional sample data for the prototype.</p>
      </main>
      {creating && <NewTaskSheet onClose={() => setCreating(false)} onCreated={(m) => { setCreating(false); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

function hrefFor(clientId: string, id: string) {
  return `/c/${clientId}/a/${id}`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
