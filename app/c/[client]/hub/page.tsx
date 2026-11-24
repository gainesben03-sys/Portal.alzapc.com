"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { HubHeader, Initials, LogSheet, NoTeam, personHref, useHub, useShoutHref } from "@/components/hub";
import { useStore } from "@/lib/store";
import { HubItem, TeamLog, TeamMember, weekItems } from "@/lib/team";
import { KIND_LABEL, loadNewsletters, monthLabel, Newsletter } from "@/lib/newsletters";
import { hasPractice } from "@/lib/practice";
import { useDemo } from "@/components/perform";
import { performApi, type ListData } from "@/lib/performclient";
import { performFor, stageOf } from "@/lib/perform";
import { celebrations } from "@/lib/recognition";
const md = (d: string) => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CELEBRATE: HubItem["kind"][] = ["birthday", "anniversary"];

/** Manager Hub home: three to five things for your team this week, in a couple of minutes. */
export default function HubHome() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, clients, resources, config, hires } = useStore();
  const client = getClient(clientId);
  const h = useHub(clientId);
  const shout = useShoutHref(clientId);
  const toast = useToast();
  const [log, setLog] = useState<{ kind: TeamLog["kind"]; person?: TeamMember } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);
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
  const first = (h.managerName || "").split(" ")[0];
  const byId = (id?: string) => h.team.find((p) => p.id === id);
  const training = !config[clientId]?.modules.training ? undefined : resources.find((r) => hasPractice(r) && r.shares.some((s) => s.clientId === clientId));

  // ---------- your attention this week, by category
  const todo = items.filter((it) => !CELEBRATE.includes(it.kind));
  const cats: { key: string; label: string; blurb: string; rows: React.ReactNode[] }[] = [];
  const itemRow = (it: HubItem) => {
    const p = byId(it.personId);
    return (
      <div className="th-row" key={it.key}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="th-row-t">{it.title}</div>
          <div className="tiny muted">{it.why}</div>
        </div>
        {it.action === "open" || !p ? (
          <Link className="btn sm" href={p ? personHref(clientId, p.id) : `/c/${clientId}/hub/team`}>Open</Link>
        ) : (
          it.action === "recognize" ? (shout ? <Link className="btn sm" href={shout(p)}>Send a shoutout</Link> : null) : <button className="btn sm" onClick={() => setLog({ kind: "checkin", person: p })}>Log check-in</button>
        )}
      </div>
    );
  };
  if (reviewItems.length)
    cats.push({
      key: "reviews", label: "Reviews", blurb: reviewItems.some((x) => x.st === "overdue") ? "One or more is past due" : "Reviews you owe soon",
      rows: reviewItems.map(({ r, st }) => {
        const f = r.name.split(" ")[0];
        const late = st === "overdue";
        return (
          <div className={`th-row ${late ? "late" : ""}`} key={`rv-${r.id}`}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="th-row-t">{late ? `${f}'s review is past due` : st === "not_started" ? `${f}'s review is due ${md(r.due)}` : `Finish ${f}'s review`}</div>
              <div className="tiny muted">{st === "not_started" ? (r.self?.doneAt ? `${f}'s self-assessment is in. About 10 minutes.` : "About 10 minutes, on your phone or computer.") : st === "ready" ? "Ready to share." : `Due ${md(r.due)}. Pick up where you left off.`}</div>
            </div>
            <Link className={`btn sm ${late ? "primary" : ""}`} href={`/c/${clientId}/reviews/${r.id}`}>{st === "not_started" ? "Start" : "Continue"}</Link>
          </div>
        );
      }),
    });
  const ci = todo.filter((it) => it.kind === "checkin");
  const rc = todo.filter((it) => it.kind === "recognize");
  const other = todo.filter((it) => it.kind !== "checkin" && it.kind !== "recognize");
  if (ci.length) cats.push({ key: "checkin", label: "Team check-ins", blurb: "People without a recent check-in", rows: ci.map(itemRow) });
  if (rc.length) cats.push({ key: "recognize", label: "Recognition", blurb: "People without recent recognition", rows: rc.map(itemRow) });
  if (other.length) cats.push({ key: "other", label: "Other follow-ups", blurb: "Open commitments and new starters", rows: other.map(itemRow) });
  const total = cats.reduce((n, c) => n + c.rows.length, 0);
  const isOpen = (k: string) => showAll || openCat === k;

  // ---------- upcoming team moments: one list, in date order
  const moments = celebrations(h.team.map((p) => ({ ...p, active: p.active !== false })), new Date(), 30).filter((c) => c.days >= 0);

  // ---------- your team: who needs you
  const lastCi = (id: string) => [...h.logs].filter((l) => l.personId === id && l.kind === "checkin").sort((a, b) => b.date.localeCompare(a.date))[0];
  const needsCi = new Set(ci.map((it) => it.personId));
  const needsRc = new Set(rc.map((it) => it.personId));
  const roster = [...h.team].sort((a, b) => Number(needsCi.has(b.id)) - Number(needsCi.has(a.id)) || a.name.localeCompare(b.name));
  const weekOf = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); })();
  const whose = h.isAdvisor ? (h.managerName ? `${h.managerName.split(" ")[0]}'s team` : "This team") : first ? `${first}'s team` : "Your team";

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        <HubHeader
          clientId={clientId}
          title="Team Overview"
          sub={`${whose} · Week of ${weekOf}`}
          action={h.team.length ? (
            <div className="th-actions" data-tour="hub-quick">
              <button className="btn primary sm" onClick={() => setLog({ kind: "checkin" })}>+ New check-in</button>
              {shout && <Link className="btn sm" href={shout()}>Send a shoutout</Link>}
            </div>
          ) : undefined}
        />

        {h.team.length === 0 ? (
          <NoTeam clientId={clientId} />
        ) : (
          <>
            <div className="th-stats">
              <div><b>{h.team.length}</b><span>Team members</span></div>
              <div><b>{ci.length}</b><span>Check-ins due</span></div>
              <div><b>{rc.length + moments.filter((m) => m.days <= 7 && m.kind !== "new").length}</b><span>Recognition opportunities</span></div>
            </div>

            <div className="th-cols">
              <div className="th-main">
                <section className="card th-card" data-tour="hub-week">
                  <div className="th-head">
                    <h2>Your attention this week</h2>
                    {total > 0 && <span className="th-count">{total} item{total === 1 ? "" : "s"}</span>}
                    {cats.length > 1 && <button className="linklike tiny" style={{ marginLeft: "auto" }} onClick={() => { setShowAll(!showAll); setOpenCat(null); }}>{showAll ? "Collapse" : "View all"}</button>}
                  </div>
                  {!cats.length && <p className="small muted" style={{ margin: "4px 0 6px" }}>You&apos;re caught up. A good week to recognize someone for something small.</p>}
                  {cats.map((c) => (
                    <div key={c.key} className={`th-cat ${isOpen(c.key) ? "open" : ""}`}>
                      <button className="th-cat-h" aria-expanded={isOpen(c.key)} onClick={() => { setShowAll(false); setOpenCat(openCat === c.key ? null : c.key); }}>
                        <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                          <b>{c.label}</b>
                          <span className="tiny muted">{c.blurb}</span>
                        </span>
                        <span className={`th-num ${c.key === "reviews" && reviewItems.some((x) => x.st === "overdue") ? "late" : ""}`}>{c.rows.length}</span>
                        <span className="th-chev" aria-hidden="true">›</span>
                      </button>
                      {isOpen(c.key) && <div className="th-rows">{c.rows}</div>}
                    </div>
                  ))}
                </section>

                {moments.length > 0 && (
                  <section className="card th-card">
                    <div className="th-head"><h2>Upcoming team moments</h2></div>
                    {moments.slice(0, 8).map((m) => {
                      const p = byId(m.personId);
                      const soon = m.days <= 7 && m.kind !== "new";
                      return (
                        <div key={m.kind + m.personId} className="th-row">
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="th-row-t">{m.name}&apos;s {m.kind === "anniversary" ? `${m.years}-year anniversary` : m.kind === "birthday" ? "birthday" : "first day"}</div>
                            <div className="tiny muted">{m.days === 0 ? "Today" : m.days === 1 ? "Tomorrow" : new Date(Date.now() + m.days * 864e5).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
                          </div>
                          {soon && p && shout && <Link className="linklike small" href={shout(p)}>Send a shoutout ›</Link>}
                          {m.kind === "new" && p && <Link className="linklike small" href={personHref(clientId, p.id)}>Plan their first week ›</Link>}
                        </div>
                      );
                    })}
                  </section>
                )}

                {(() => {
                  // new hires on this manager's team, through day 90, with their plan
                  const today = new Date().toISOString().slice(0, 10);
                  const plus = (d: string, n: number) => new Date(new Date(d + "T12:00").getTime() + n * 864e5).toISOString().slice(0, 10);
                  const mine = config[clientId]?.onboarding?.experience?.on
                    ? hires.filter((x) => x.clientId === clientId && !x.outcome && !x.imported && !x.xp?.closed && x.startDate && !!h.managerName && (x.managerName || "").trim().toLowerCase() === h.managerName.trim().toLowerCase() && today >= plus(x.startDate, -45) && today <= plus(x.startDate, 90))
                    : [];
                  if (!mine.length) return null;
                  return (
                    <section className="card th-card">
                      <div className="th-head"><h2>My new hires</h2></div>
                      {mine.map((x) => {
                        const days = Math.round((new Date(x.startDate + "T12:00").getTime() - new Date(today + "T12:00").getTime()) / 864e5);
                        return (
                          <Link key={x.id} href={`/c/${clientId}/hires/${x.id}#plan`} className="th-row th-link">
                            <b className="grow">{x.name}</b>
                            <span className="tiny muted">{days > 1 ? `starts in ${days} days` : days === 1 ? "starts tomorrow" : days === 0 ? "starts today" : `day ${1 - days}`}</span>
                            <span className="tiny" style={{ color: "var(--blue)" }}>Your plan ›</span>
                          </Link>
                        );
                      })}
                    </section>
                  );
                })()}
              </div>

              <aside className="th-side">
                <section className="card th-card">
                  <div className="th-head"><h2>Your team</h2><Link className="tiny" style={{ marginLeft: "auto" }} href={`/c/${clientId}/hub/team`}>View all</Link></div>
                  {roster.slice(0, 8).map((p) => {
                    const l = lastCi(p.id);
                    const status = needsCi.has(p.id) ? { t: "Check-in needed", c: "amber" } : needsRc.has(p.id) ? { t: "Recognize", c: "blue" } : { t: "On track", c: "green" };
                    return (
                      <Link key={p.id} href={personHref(clientId, p.id)} className="th-person">
                        <Initials name={p.name} />
                        <span className="grow" style={{ minWidth: 0 }}>
                          <b className="small ellipsis" style={{ display: "block" }}>{p.name}</b>
                          <span className="tiny muted">Last check-in: {l ? md(l.date) : "Not logged"}</span>
                        </span>
                        <span className={`th-status ${status.c}`}>{status.t}</span>
                      </Link>
                    );
                  })}
                  {roster.length > 8 && <Link className="tiny th-more" href={`/c/${clientId}/hub/team`}>View all {roster.length} team members</Link>}
                </section>

                {training && (
                  <Link href={`/c/${clientId}/hub/learn/${training.id}`} className="card th-card th-tool">
                    <b className="small" style={{ display: "block" }}>Practice: {training.practice!.content.en!.title}</b>
                    <span className="tiny muted">5 minutes. Role-play a real conversation.</span>
                  </Link>
                )}
                {minute && (
                  <Link href={`/c/${clientId}/newsletters`} className="card th-card th-tool">
                    <span className="tiny muted" style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>{KIND_LABEL[minute.kind]} · {monthLabel(minute.month)}</span>
                    <b className="small" style={{ display: "block", marginTop: 4 }}>{minute.subject.replace(/^Manager Minute:\s*/i, "").replace(/\s*\|.*$/, "")}</b>
                    <span className="tiny" style={{ color: "var(--blue)" }}>Read it (2 minutes)</span>
                  </Link>
                )}
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
