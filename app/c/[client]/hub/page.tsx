"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { HubHeader, Initials, LogSheet, NoTeam, personHref, useHub } from "@/components/hub";
import { useStore } from "@/lib/store";
import { dueLabel, urgency } from "@/lib/data";
import { HubItem, TeamLog, TeamMember, weekItems } from "@/lib/team";
import { KIND_LABEL, loadNewsletters, monthLabel, Newsletter } from "@/lib/newsletters";

const ICON: Record<HubItem["kind"], string> = { birthday: "🎂", anniversary: "🎉", starting: "👋", checkin: "💬", recognize: "⭐", commitment: "✔️" };

/** Manager Hub home: three to five things for your team this week, in a couple of minutes. */
export default function HubHome() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, actions, rules, clients } = useStore();
  const client = getClient(clientId);
  const h = useHub(clientId);
  const toast = useToast();
  const [log, setLog] = useState<{ kind: TeamLog["kind"]; person?: TeamMember } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [minute, setMinute] = useState<Newsletter | null>(null);

  const demoClients = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, accent: c.accent })), [clients]);
  useEffect(() => {
    // after landing here once, the Home menu item goes to Home
    try {
      sessionStorage.setItem("alza-home-ok", "1");
    } catch {}
  }, []);
  useEffect(() => {
    if (!ok) return;
    loadNewsletters({ clientId, light: true, demoClients }).then((r) => setMinute(r.list.filter((n) => n.inLibrary && n.kind === "manager-minute").sort((a, b) => b.month.localeCompare(a.month))[0] ?? null));
  }, [ok, clientId, demoClients]);

  if (!ok || !client) return null;
  const items = weekItems(h.team, h.logs);
  const shown = showAll ? items : items.slice(0, 5);
  const myTasks = actions.filter((a) => a.clientId === clientId && a.side === "client" && a.status !== "completed" && !!h.managerEmail && (a.owner.email ?? "").toLowerCase() === h.managerEmail);
  const first = (h.managerName || "").split(" ")[0];
  const byId = (id?: string) => h.team.find((p) => p.id === id);

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <HubHeader clientId={clientId} title={h.isAdvisor ? "This week" : `Hi ${first}`} sub={h.team.length ? `${items.length ? `${Math.min(items.length, 5)} things for your team this week.` : "Nothing pressing for your team this week."} ${h.team.length} ${h.team.length === 1 ? "person reports" : "people report"} to ${h.isAdvisor ? h.managerName : "you"}.` : undefined} />

        {h.team.length === 0 ? (
          <NoTeam clientId={clientId} />
        ) : (
          <>
            <div className="hub-quick section">
              <button className="btn primary" onClick={() => setLog({ kind: "checkin" })}>💬 Log a check-in</button>
              <button className="btn" onClick={() => setLog({ kind: "recognition" })}>⭐ Recognize someone</button>
            </div>

            <div className="card section hub-week">
              {items.length === 0 && <p className="small muted" style={{ margin: 0 }}>You&apos;re caught up. A good week to recognize someone for something small.</p>}
              {shown.map((it) => {
                const p = byId(it.personId);
                return (
                  <div className="hub-item" key={it.key}>
                    <span className="hub-icon" aria-hidden="true">{ICON[it.kind]}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{it.title}</div>
                      <div className="tiny muted">{it.why}</div>
                    </div>
                    {it.action === "open" || !p ? (
                      <Link className="btn sm" href={p ? personHref(clientId, p.id) : `/c/${clientId}/hub/team`}>Open</Link>
                    ) : (
                      <button className="btn sm" onClick={() => setLog({ kind: it.action === "recognize" ? "recognition" : "checkin", person: p })}>{it.action === "recognize" ? "Recognize" : "Log"}</button>
                    )}
                  </div>
                );
              })}
              {items.length > 5 && <button className="linklike tiny" style={{ marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? "Show the top 5" : `Show all ${items.length}`}</button>}
            </div>

            {myTasks.length > 0 && (
              <>
                <div className="section-head section"><h2>From Ben</h2><Link href={`/c/${clientId}/tasks`}>All tasks</Link></div>
                <div className="card">
                  {myTasks.slice(0, 3).map((a) => (
                    <Link className="row" key={a.id} href={`/c/${clientId}/a/${a.id}`}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="title ellipsis">{a.title}</div>
                        <div className={`tiny ${["overdue", "blocker"].includes(urgency(a, rules)) ? "" : "muted"}`} style={["overdue", "blocker"].includes(urgency(a, rules)) ? { color: "var(--red)" } : undefined}>{dueLabel(a)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {minute && (
              <Link href={`/c/${clientId}/newsletters`} className="card section hub-minute">
                <span className="tiny muted" style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>{KIND_LABEL[minute.kind]} · {monthLabel(minute.month)}</span>
                <b style={{ display: "block", marginTop: 4 }}>{minute.subject.replace(/^Manager Minute:\s*/i, "").replace(/\s*\|.*$/, "")}</b>
                <span className="tiny" style={{ color: "var(--blue)" }}>Read it (2 minutes)</span>
              </Link>
            )}

            <div className="section-head section"><h2>Your team</h2><Link href={`/c/${clientId}/hub/team`}>See everyone</Link></div>
            <div className="hub-faces">
              {h.team.slice(0, 8).map((p) => (
                <Link key={p.id} href={personHref(clientId, p.id)} className="hub-face">
                  <Initials name={p.name} />
                  <span className="tiny ellipsis">{p.name.split(" ")[0]}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      {log && (
        <LogSheet
          clientId={clientId}
          kind={log.kind}
          person={log.person}
          team={h.team}
          onClose={() => setLog(null)}
          onSaved={(m) => {
            setLog(null);
            toast.show(m);
          }}
        />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
