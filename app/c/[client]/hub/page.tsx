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
import { hasPractice } from "@/lib/practice";
import { useDemo } from "@/components/perform";
import { performApi, type ListData } from "@/lib/performclient";
import { performFor, stageOf } from "@/lib/perform";
import { celebrations } from "@/lib/recognition";
const md = (d: string) => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CELEBRATE: HubItem["kind"][] = ["birthday", "anniversary"];
const ICON: Record<HubItem["kind"], string> = { birthday: "🎂", anniversary: "🎉", starting: "👋", checkin: "💬", recognize: "⭐", commitment: "✔️" };

/** Manager Hub home: three to five things for your team this week, in a couple of minutes. */
export default function HubHome() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, actions, rules, clients, resources, config, hires } = useStore();
  const client = getClient(clientId);
  const h = useHub(clientId);
  const toast = useToast();
  const [log, setLog] = useState<{ kind: TeamLog["kind"]; person?: TeamMember } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [minute, setMinute] = useState<Newsletter | null>(null);
  const [rv, setRv] = useState<ListData | null>(null);
  const perfDemo = useDemo(clientId);
  const perfOn = !!config[clientId]?.modules.perform;

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

  useEffect(() => {
    if (!ok || !perfOn) return;
    performApi(clientId, { action: "list" }, perfDemo).then((r) => r.ok && setRv(r as ListData)).catch(() => undefined);
  }, [ok, perfOn, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  // Reviews this manager owes, due in the next 3 weeks or late. They lead the list.
  const ps = performFor(rv?.settings);
  const today0 = new Date().toISOString().slice(0, 10);
  const in21 = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
  const reviewItems = (rv?.reviews ?? [])
    .filter((r) => (r.managerEmail || "").toLowerCase() === (h.managerEmail || "").toLowerCase())
    .map((r) => ({ r, st: stageOf(r, ps) }))
    .filter(({ r, st }) => st === "overdue" || st === "in_progress" || st === "ready" || (st === "not_started" && r.due <= in21))
    .sort((a, b) => (a.st === "overdue" ? -1 : b.st === "overdue" ? 1 : a.r.due < b.r.due ? -1 : 1));
  const items = weekItems(h.team, h.logs);
  const myTasks = actions.filter((a) => a.clientId === clientId && a.side === "client" && a.status !== "completed" && !!h.managerEmail && (a.owner.email ?? "").toLowerCase() === h.managerEmail);
  const first = (h.managerName || "").split(" ")[0];
  const byId = (id?: string) => h.team.find((p) => p.id === id);
  const training = !config[clientId]?.modules.training ? undefined : resources.find((r) => hasPractice(r) && r.shares.some((s) => s.clientId === clientId));

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        {(() => {
          const needs = reviewItems.length + items.filter((it) => !CELEBRATE.includes(it.kind)).length;
          const whose = h.isAdvisor ? (h.managerName ? `${h.managerName.split(" ")[0]}'s team` : "This team") : "Your team";
          return (
            <HubHeader
              clientId={clientId}
              title={`${whose} this week`}
              sub={h.team.length ? `${needs ? `${needs} ${needs === 1 ? "thing needs" : "things need"} ${h.isAdvisor ? "attention" : "you"}` : "Nothing needs you right now"} · ${h.team.length} ${h.team.length === 1 ? "person" : "people"}` : undefined}
            />
          );
        })()}

        {h.team.length === 0 ? (
          <NoTeam clientId={clientId} />
        ) : (
          <>
            <div className="hub-quick" data-tour="hub-quick">
              <button className="btn sm" onClick={() => setLog({ kind: "checkin" })}><span aria-hidden="true">💬</span> Log a check-in</button>
              <button className="btn sm" onClick={() => setLog({ kind: "recognition" })}><span aria-hidden="true">⭐</span> Recognize someone</button>
            </div>

            <div className="hub-cols">
            <div className="hub-main">
            {(() => {
              const todo = items.filter((it) => !CELEBRATE.includes(it.kind));
              const fun = items.filter((it) => CELEBRATE.includes(it.kind));
              const cap = Math.max(3, 5 - reviewItems.length);
              const todoShown = showAll ? todo : todo.slice(0, cap);
              const row = (it: HubItem) => {
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
              };
              return (
                <>
                  <div className="card hub-week" data-tour="hub-week">
                    <div className="hub-sec">Needs you</div>
                    {reviewItems.map(({ r, st }) => {
                      const f = r.name.split(" ")[0];
                      const late = st === "overdue";
                      return (
                        <div className={`hub-item ${late ? "late" : ""}`} key={`rv-${r.id}`}>
                          <span className="hub-icon" aria-hidden="true">📝</span>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="title">{late ? `${f}'s review is past due` : st === "not_started" ? `${f}'s review is due ${md(r.due)}` : `Finish ${f}'s review`}{late && <span className="hub-late">Past due</span>}</div>
                            <div className="tiny muted">{st === "not_started" ? (r.self?.doneAt ? `${f}'s self-assessment is in. About 10 minutes.` : "About 10 minutes, on your phone or computer.") : st === "ready" ? "Ready to share." : `Due ${md(r.due)}. Pick up where you left off.`}</div>
                          </div>
                          <Link className={`btn sm ${late ? "primary" : ""}`} href={`/c/${clientId}/reviews/${r.id}`}>{st === "not_started" ? "Start" : "Continue"}</Link>
                        </div>
                      );
                    })}
                    {todoShown.map(row)}
                    {reviewItems.length + todo.length === 0 && <p className="small muted" style={{ margin: "6px 0" }}>You&apos;re caught up. A good week to recognize someone for something small.</p>}
                    {todo.length > cap && <button className="linklike tiny hub-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${todo.length + reviewItems.length}`}</button>}
                  </div>
                  {fun.length > 0 && (
                    <div className="card hub-week hub-fun">
                      <div className="hub-sec">Celebrate this week</div>
                      {fun.map(row)}
                    </div>
                  )}
                </>
              );
            })()}

            {(() => {
              // new hires on this manager's team, through day 90, with their plan
              const today = new Date().toISOString().slice(0, 10);
              const plus = (d: string, n: number) => new Date(new Date(d + "T12:00").getTime() + n * 864e5).toISOString().slice(0, 10);
              const mine = config[clientId]?.onboarding?.experience?.on
                ? hires.filter((x) => x.clientId === clientId && !x.outcome && !x.imported && !x.xp?.closed && x.startDate && !!h.managerName && (x.managerName || "").trim().toLowerCase() === h.managerName.trim().toLowerCase() && today >= plus(x.startDate, -45) && today <= plus(x.startDate, 90))
                : [];
              if (!mine.length) return null;
              return (
                <div className="card section">
                  <h2 className="tw-h" style={{ marginTop: 0 }}>My new hires</h2>
                  {mine.map((x) => {
                    const days = Math.round((new Date(x.startDate + "T12:00").getTime() - new Date(today + "T12:00").getTime()) / 864e5);
                    return (
                      <Link key={x.id} href={`/c/${clientId}/hires/${x.id}#plan`} className="row" style={{ gap: 10, padding: "10px 0", borderTop: "1px solid var(--line)", textDecoration: "none", color: "inherit", justifyContent: "flex-start" }}>
                        <b className="grow">{x.name}</b>
                        <span className="tiny muted">{days > 1 ? `starts in ${days} days` : days === 1 ? "starts tomorrow" : days === 0 ? "starts today" : `day ${1 - days}`}</span>
                        <span className="tiny" style={{ color: "var(--blue)" }}>Your plan ›</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })()}
            {(() => {
              // later this month (this week's are already in the list above)
              const later = celebrations(h.team.map((p) => ({ ...p, active: p.active !== false })), new Date(), 30).filter((c) => c.days > 7).sort((a, b) => a.days - b.days);
              if (!later.length) return null;
              const ICO = { birthday: "🎂", anniversary: "🎉", new: "👋" } as const;
              return (
                <div className="card section">
                  <h2 className="tw-h" style={{ marginTop: 0 }}>Later this month</h2>
                  {later.slice(0, 6).map((c) => (
                    <div key={c.kind + c.personId} className="cel-row">
                      <span aria-hidden="true">{ICO[c.kind]}</span>
                      <span className="grow" style={{ minWidth: 0 }}><b className="small">{c.name}</b> <span className="tiny muted">· {c.kind === "birthday" ? "Birthday" : c.kind === "anniversary" ? `${c.years} year${c.years === 1 ? "" : "s"} here` : "Starts"}</span></span>
                      <span className="tiny muted">{c.when}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            </div>
            <aside className="hub-side">
            <div className="hub-tools section">
              {training && (
                <Link href={`/c/${clientId}/hub/learn/${training.id}`} className="card hub-tool">
                  <span className="hub-icon" aria-hidden="true">🎯</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b className="small" style={{ display: "block" }}>Practice: {training.practice!.content.en!.title}</b>
                    <span className="tiny muted">5 minutes. Role-play a real conversation.</span>
                  </span>
                </Link>
              )}
            </div>

            {false && myTasks.length > 0 && (
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
            </aside>
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
