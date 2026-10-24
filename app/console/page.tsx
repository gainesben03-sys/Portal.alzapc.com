"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ActionCard, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { CLIENTS, fmt, parseDay, urgency } from "@/lib/data";
import { useStore } from "@/lib/store";

const ORDER = { blocker: 0, overdue: 1, today: 2, soon: 3, later: 4, done: 5 } as const;

export default function Console() {
  const ok = useGuard("advisor");
  const { actions, rules, update } = useStore();
  const toast = useToast();

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

  if (!ok) return null;

  return (
    <>
      <AlzaTopbar />
      <main className="wrap wide">
        <div className="hero">
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

        <div className="kpis section" style={{ marginTop: 16 }}>
          <div className="kpi">
            <div className="n">{CLIENTS.length}</div>
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
              <Link href="/console/rules">Reminder rules</Link>
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
            </div>
            <div className="card">
              {CLIENTS.map((c) => {
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
                    {c.pilot ? (
                      <Link className="btn sm" href={`/c/${c.id}`}>
                        Open
                      </Link>
                    ) : (
                      <span className="tiny muted">Not in pilot</span>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
        <p className="demo-note">Fictional sample data for the prototype.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

function hrefFor(clientId: string, id: string) {
  const c = CLIENTS.find((x) => x.id === clientId)!;
  return c.pilot ? `/c/${clientId}/a/${id}` : `/console`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
