"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NewTaskSheet } from "@/components/newtask";
import { DraftPanel } from "@/components/draft";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { daysSince } from "@/lib/modules";
import { Action, dueLabel, fmt, parseDay, today, urgency } from "@/lib/data";
import { useStore } from "@/lib/store";
import { daysUntil } from "@/lib/hires";
import { loadNewsletters, monthLabel, Newsletter, thisMonth } from "@/lib/newsletters";

const ORDER = { blocker: 0, overdue: 1, today: 2, soon: 3, later: 4, done: 5 } as const;
type SortBy = "due" | "client" | "urgent";
const PREF_KEY = "alza-dash-v1";

/** Calendar days from today to the due date (negative = late). */
const dayDiff = (iso: string) => Math.round((parseDay(iso).getTime() - today().getTime()) / 864e5);

function bucket(iso: string): string {
  const d = dayDiff(iso);
  if (d < 0) return "Overdue";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  const dow = today().getDay(); // 0 Sun
  const toSunday = (7 - dow) % 7;
  if (d <= toSunday) return "This week";
  if (d <= toSunday + 7) return "Next week";
  return "Later";
}
const BUCKETS = ["Overdue", "Today", "Tomorrow", "This week", "Next week", "Later"];

type Focus = { key: string; score: number; clientId?: string; title: string; why: string; href: string; cta: string; tone: "red" | "amber" | "blue" };

export default function Console() {
  const ok = useGuard("advisor");
  const { actions, rules, update, notes, candidates, roles, getClient, files, clients, live, hires } = useStore();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [freeDraft, setFreeDraft] = useState<string | null>(null);
  const [only, setOnly] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("due");
  const [showAllFocus, setShowAllFocus] = useState(false);
  const [letters, setLetters] = useState<Newsletter[]>([]);

  // remember the filter and sort between visits
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      if (p.only) setOnly(p.only);
      if (p.sortBy) setSortBy(p.sortBy);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ only, sortBy }));
    } catch {}
  }, [only, sortBy]);
  useEffect(() => {
    if (!ok) return;
    loadNewsletters({ light: true, demoClients: clients.map((c) => ({ id: c.id, name: c.name, accent: c.accent })) }).then((r) => setLetters(r.list));
  }, [ok, clients]);

  const inScope = (clientId?: string) => only === "all" || clientId === only;
  const open = useMemo(() => actions.filter((a) => a.status !== "completed"), [actions]);
  const rank = (a: Action) => ORDER[urgency(a, rules)];
  const byDue = (a: Action, b: Action) => parseDay(a.due).getTime() - parseDay(b.due).getTime() || rank(a) - rank(b);

  const mineAll = open.filter((a) => a.side === "alza");
  const waitingAll = open.filter((a) => a.side === "client");
  const mine = mineAll.filter((a) => inScope(a.clientId)).sort(byDue);
  const waiting = waitingAll.filter((a) => inScope(a.clientId)).sort((a, b) => rank(a) - rank(b) || byDue(a, b));
  const late = (a: Action) => ["overdue", "blocker"].includes(urgency(a, rules));
  const mineLate = mine.filter(late);
  const mineWeek = mine.filter((a) => dayDiff(a.due) >= 0 && ["Today", "Tomorrow", "This week"].includes(bucket(a.due)));
  const clientLate = waiting.filter(late);

  const extensions = open.filter((a) => a.status === "extension_requested" && inScope(a.clientId));
  const newNotes = notes.filter((n) => n.status === "new" && inScope(n.clientId));
  const awaiting = candidates.filter((c) => !c.decision && inScope(roles.find((r) => r.id === c.roleId)?.clientId));
  const newFiles = files.filter((f) => !f.reviewed && !f.fromAdvisor && inScope(f.clientId));
  const name = (id?: string) => (id ? getClient(id)?.name ?? "" : "");

  // ---------------------------------------------------------------- what to work on
  const focus: Focus[] = useMemo(() => {
    const f: Focus[] = [];
    for (const a of mine) {
      const d = dayDiff(a.due);
      const asked = a.requestedBy ? ` ${a.requestedBy.name.split(" ")[0]} asked for it.` : "";
      if (d < 0) f.push({ key: a.id, score: 100 - d + (a.requestedBy ? 10 : 0), clientId: a.clientId, title: a.title, why: `${dueLabel(a)}.${asked}`, href: hrefFor(a.clientId, a.id), cta: "Open", tone: "red" });
      else if (d <= 1) f.push({ key: a.id, score: 80 - d * 10 + (a.requestedBy ? 8 : 0), clientId: a.clientId, title: a.title, why: `${dueLabel(a)}.${asked}`, href: hrefFor(a.clientId, a.id), cta: "Open", tone: "amber" });
      else if (d <= 5) f.push({ key: a.id, score: 50 - d * 3 + (a.requestedBy ? 6 : 0), clientId: a.clientId, title: a.title, why: `${dueLabel(a)}. Get ahead of it.${asked}`, href: hrefFor(a.clientId, a.id), cta: "Open", tone: "blue" });
    }
    for (const n of newNotes) f.push({ key: n.id, score: n.urgent ? 95 : 48, clientId: n.clientId, title: `${n.urgent ? "Urgent " : ""}${n.kind.toLowerCase()} from ${n.author.name}`, why: n.text.length > 90 ? n.text.slice(0, 90) + "..." : n.text, href: "/console/board", cta: "Reply", tone: n.urgent ? "red" : "blue" });
    for (const c of awaiting) {
      const role = roles.find((r) => r.id === c.roleId);
      if (!role) continue;
      const days = daysSince(c.sentAt);
      if (c.otherOffers || days >= 3) f.push({ key: c.id, score: c.otherOffers ? 88 : 40 + days, clientId: role.clientId, title: `Get feedback on ${c.name} (${role.title})`, why: `${role.hiringManager.name} has had them ${days} days.${c.otherOffers ? " They have other offers." : ""}`, href: `/c/${role.clientId}/recruiting`, cta: "Follow up", tone: c.otherOffers ? "red" : "amber" });
    }
    for (const h of hires) {
      if (!inScope(h.clientId) || h.status === "Started") continue;
      const hasOffer = (h.docs ?? []).some((d) => d.kind === "offer");
      const n = h.startDate ? daysUntil(h.startDate) : 99;
      if (h.status === "Approved to hire" && !hasOffer) f.push({ key: h.id, score: 86 + Math.max(0, 14 - n), clientId: h.clientId, title: `Offer letter for ${h.name || "new hire"}`, why: `${h.title || "New hire"}${h.startDate ? `, starts ${n <= 0 ? "now" : `in ${n} days`}` : ""}. Fill a past letter or draft one.`, href: `/c/${h.clientId}/hires/${h.id}?from=console`, cta: "Start", tone: n <= 7 ? "red" : "amber" });
      else if (h.status === "Offer sent" && h.esign?.offer?.status !== "signed" && n <= 10) f.push({ key: h.id, score: 62, clientId: h.clientId, title: `${h.name}'s offer isn't signed yet`, why: `Starts in ${n} days.`, href: `/c/${h.clientId}/hires/${h.id}?from=console`, cta: "Check", tone: "amber" });
    }
    for (const a of extensions) f.push({ key: "x" + a.id, score: 70, clientId: a.clientId, title: `Extension request: ${a.title}`, why: `${a.owner.name} wants until ${fmt(a.extension!.requested)}.`, href: hrefFor(a.clientId, a.id), cta: "Decide", tone: "amber" });
    if (newFiles.length) f.push({ key: "files", score: 45 + newFiles.length, clientId: only === "all" ? undefined : only, title: `${newFiles.length} new file${newFiles.length > 1 ? "s" : ""} to review`, why: newFiles.slice(0, 3).map((x) => x.name).join(", "), href: "/console/files", cta: "Review", tone: "blue" });
    // clients who've gone quiet on their items
    const lateByClient = new Map<string, Action[]>();
    for (const a of clientLate) lateByClient.set(a.clientId, [...(lateByClient.get(a.clientId) ?? []), a]);
    for (const [cid, list] of lateByClient) {
      const worst = Math.max(...list.map((a) => -dayDiff(a.due)));
      if (worst >= 3) f.push({ key: "late" + cid, score: 52 + Math.min(20, worst), clientId: cid, title: `${name(cid)} is behind on ${list.length} item${list.length > 1 ? "s" : ""}`, why: `Oldest is ${worst} days late. A quick call usually beats another reminder.`, href: `/c/${cid}`, cta: "Open", tone: "amber" });
    }
    // newsletters for this month that haven't gone out
    const m = thisMonth();
    const unsent = letters.filter((n) => n.month === m && n.status !== "sent" && inScope(n.clientId));
    const dom = new Date().getDate();
    if (unsent.length) f.push({ key: "nl", score: dom >= 20 ? 66 : dom >= 10 ? 46 : 30, clientId: only === "all" ? undefined : only, title: `${unsent.length} ${monthLabel(m).split(" ")[0]} newsletter${unsent.length > 1 ? "s" : ""} not sent`, why: unsent.slice(0, 3).map((n) => name(n.clientId)).filter(Boolean).join(", ") + (dom >= 20 ? ". The month is almost over." : "."), href: "/console/newsletters", cta: "Send", tone: dom >= 20 ? "amber" : "blue" });
    // next month's not queued yet, late in the month
    const next = new Date();
    next.setMonth(next.getMonth() + 1, 1);
    const nm = thisMonth(next);
    if (dom >= 22 && letters.length && !letters.some((n) => n.month === nm && inScope(n.clientId))) f.push({ key: "nl-next", score: 34, title: `Queue ${monthLabel(nm).split(" ")[0]}'s newsletters`, why: "Claude can write them from this month's designs.", href: "/console/newsletters", cta: "Start", tone: "blue" });
    return f.sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, newNotes, awaiting, hires, extensions, newFiles, clientLate, letters, only, roles]);

  if (!ok) return null;
  const shownFocus = showAllFocus ? focus : focus.slice(0, 5);
  const scopeName = only === "all" ? "" : name(only);

  // ---------------------------------------------------------------- "You owe" grouping
  const groups: { label: string; items: Action[] }[] =
    sortBy === "due"
      ? BUCKETS.map((b) => ({ label: b, items: mine.filter((a) => bucket(a.due) === b) })).filter((g) => g.items.length)
      : sortBy === "client"
        ? clients.map((c) => ({ label: c.name, items: mine.filter((a) => a.clientId === c.id) })).filter((g) => g.items.length)
        : [{ label: "", items: [...mine].sort((a, b) => rank(a) - rank(b) || byDue(a, b)) }];
  const count = (cid: string) => mineAll.filter((a) => a.clientId === cid).length + waitingAll.filter((a) => a.clientId === cid && late(a)).length;

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <div className="hero row" style={{ alignItems: "flex-start" }}>
          <div>
            <h1>Good {greeting()}, Ben</h1>
            <p>
              {focus.length ? (
                <>Start with <b>{focus[0].title}</b>{focus[0].clientId && only === "all" ? ` (${name(focus[0].clientId)})` : ""}. </>
              ) : (
                "You're caught up. "
              )}
              {mineWeek.length > 0 && `${mineWeek.length} of yours due this week. `}
              {mineLate.length > 0 && <span style={{ color: "var(--red)" }}>{mineLate.length} late. </span>}
            </p>
          </div>
          {clients.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {live && <button className="btn sm" onClick={() => setFreeDraft(only !== "all" ? only : clients[0].id)}><span className="spark" aria-hidden="true">✦</span> Draft with Claude</button>}
              <button className="btn primary sm" onClick={() => setCreating(true)}>New request</button>
            </div>
          )}
        </div>

        <div className="dash-filter" role="tablist" aria-label="Filter by client">
          <button className={`chip chip-btn ${only === "all" ? "on" : ""}`} onClick={() => setOnly("all")}>All clients</button>
          {clients.map((c) => (
            <button key={c.id} className={`chip chip-btn ${only === c.id ? "on" : ""}`} onClick={() => setOnly(only === c.id ? "all" : c.id)}>
              <span className="dash-dot" style={{ background: c.accent }} aria-hidden="true" />
              {c.name}
              {count(c.id) > 0 && <span className="dash-count">{count(c.id)}</span>}
            </button>
          ))}
        </div>

        <div className="kpis section" style={{ marginTop: 12 }}>
          <div className={`kpi ${mineLate.length ? "alert" : ""}`}><div className="n">{mineLate.length}</div><div className="l">Yours, late</div></div>
          <div className="kpi"><div className="n">{mineWeek.length}</div><div className="l">Yours, due this week</div></div>
          <div className="kpi"><div className="n">{mine.length}</div><div className="l">You owe{scopeName ? ` ${scopeName}` : ""}</div></div>
          <div className={`kpi ${clientLate.length ? "alert" : ""}`}><div className="n">{clientLate.length}</div><div className="l">Client items late</div></div>
        </div>

        {focus.length > 0 && (
          <section className="section">
            <div className="section-head"><h2>Do these first{scopeName ? `: ${scopeName}` : ""}</h2></div>
            <div className="card dash-focus">
              {shownFocus.map((x, i) => (
                <div className="dash-focus-row" key={x.key}>
                  <span className={`dash-num t-${x.tone}`}>{i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="title">{x.title}{x.clientId && only === "all" ? <span className="tiny muted"> · {name(x.clientId)}</span> : null}</div>
                    <div className="tiny muted">{x.why}</div>
                  </div>
                  <Link className="btn sm" href={x.href}>{x.cta}</Link>
                </div>
              ))}
              {focus.length > 5 && (
                <button className="linklike tiny" style={{ marginTop: 8 }} onClick={() => setShowAllFocus(!showAllFocus)}>
                  {showAllFocus ? "Show the top 5" : `Show all ${focus.length}`}
                </button>
              )}
            </div>
          </section>
        )}

        <div className="grid2 section">
          <section>
            <div className="section-head" style={{ alignItems: "center" }}>
              <h2>You owe{scopeName ? ` ${scopeName}` : ""}</h2>
              <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Sort
                <select className="f dash-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                  <option value="due">By due date</option>
                  <option value="client">By client</option>
                  <option value="urgent">Most urgent</option>
                </select>
              </label>
            </div>
            {mine.length === 0 ? (
              <div className="card small muted">Nothing on your list{scopeName ? ` for ${scopeName}` : ""}. Nice.</div>
            ) : (
              groups.map((g) => (
                <div key={g.label || "all"} className="dash-group">
                  {g.label && <div className={`dash-group-label ${g.label === "Overdue" ? "late" : ""}`}>{g.label} <span>{g.items.length}</span></div>}
                  <div className="card dash-list">
                    {g.items.map((a) => <TaskRow key={a.id} a={a} showClient={only === "all" && sortBy !== "client"} />)}
                  </div>
                </div>
              ))
            )}
          </section>

          <aside>
            <div className="section-head"><h2>Waiting on clients</h2><span className="tiny muted">{waiting.length}</span></div>
            {waiting.length === 0 ? (
              <div className="card small muted">Nothing outstanding.</div>
            ) : (
              <div className="card dash-list">
                {waiting.slice(0, 12).map((a) => (
                  <TaskRow key={a.id} a={a} showClient={only === "all"} owner>
                    {late(a) && (
                      <button
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.preventDefault();
                          update(a.id, {}, `Manual reminder sent to ${a.owner.name}`);
                          toast.show(`Reminder sent to ${a.owner.name}`);
                        }}
                      >
                        Nudge
                      </button>
                    )}
                  </TaskRow>
                ))}
                {waiting.length > 12 && <div className="tiny muted" style={{ padding: "8px 2px 0" }}>Plus {waiting.length - 12} more not due yet.</div>}
              </div>
            )}

            {(newNotes.length > 0 || awaiting.length > 0 || newFiles.length > 0) && (
              <div className="section">
                <div className="section-head"><h2>Needs a look</h2></div>
                <div className="card">
                  {newFiles.map((f) => (
                    <Link className="row" key={f.id} href="/console/files">
                      <div className="grow">
                        <div className="title ellipsis">{f.name}</div>
                        <div className="tiny muted ellipsis">{name(f.clientId)} · shared by {f.by}{f.confidential ? " · confidential" : ""}</div>
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
                        <div className="tiny muted ellipsis">{name(n.clientId)} · {n.text}</div>
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
              <div className="section">
                <div className="section-head"><h2>Extension requests</h2></div>
                <div className="card">
                  {extensions.map((a) => (
                    <div className="row" key={a.id}>
                      <div className="grow">
                        <div className="title ellipsis">{a.title}</div>
                        <div className="tiny muted">{a.owner.name} asks for {fmt(a.extension!.requested)}: {a.extension!.reason}</div>
                      </div>
                      <button
                        className="btn sm primary"
                        onClick={() => {
                          update(a.id, { due: a.extension!.requested, status: "in_progress", extension: undefined }, `Extension approved. New due date ${fmt(a.extension!.requested)}`);
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

            <div className="section-head section">
              <h2>Clients</h2>
              <Link href="/console/clients">Set up</Link>
            </div>
            <div className="card">
              {clients.map((b) => getClient(b.id)!).map((c) => {
                const cMine = mineAll.filter((a) => a.clientId === c.id);
                const cOpen = waitingAll.filter((a) => a.clientId === c.id);
                const cLate = cOpen.filter(late);
                return (
                  <div className={`row dash-client ${only === c.id ? "on" : ""}`} key={c.id}>
                    <button className="dash-client-btn" onClick={() => setOnly(only === c.id ? "all" : c.id)} title={only === c.id ? "Show all clients" : `Show only ${c.name}`}>
                      <span className="client-chip" style={{ background: c.accent }}>{c.name.slice(0, 2).toUpperCase()}</span>
                      <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                        <span className="title" style={{ display: "block" }}>{c.name}</span>
                        <span className="tiny muted">
                          {cMine.length} yours · {cOpen.length} theirs
                          {cLate.length > 0 && <span style={{ color: "var(--red)" }}> · {cLate.length} late</span>}
                        </span>
                      </span>
                    </button>
                    <Link className="btn sm" href={`/c/${c.id}`}>Open</Link>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
        {!live && <p className="demo-note">Fictional sample data for the prototype.</p>}
      </main>
      {freeDraft && (
        <div className="scrim" onClick={() => setFreeDraft(null)}>
          <div className="sheet" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <label className="f" style={{ marginTop: 0 }}>For which client</label>
            <select className="f" value={freeDraft} onChange={(e) => setFreeDraft(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{getClient(c.id)?.name}</option>)}
            </select>
            <div style={{ maxHeight: "65vh", overflow: "auto", marginTop: 10 }}>
              <DraftPanel
                key={freeDraft}
                clientId={freeDraft}
                mode="document"
                title={`Document for ${getClient(freeDraft)?.name}`}
                askForInstructions
                primaryLabel="Done"
                onClose={() => setFreeDraft(null)}
                onUse={() => setFreeDraft(null)}
              />
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>To share it with the client, draft it from a task instead, or download it and upload it to their folder.</p>
          </div>
        </div>
      )}
      {creating && <NewTaskSheet onClose={() => setCreating(false)} onCreated={(m) => { setCreating(false); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

/** A short due badge that leaves room for the title: "3d late", "Today", "Oct 29". */
function ShortDue({ a }: { a: Action }) {
  const { rules } = useStore();
  const u = urgency(a, rules);
  const d = dayDiff(a.due);
  const label = d < 0 ? `${-d}d late` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmt(a.due);
  return (
    <span className={`pill ${u}`} title={dueLabel(a)}>
      <span className="dot" />
      {label}
    </span>
  );
}

/** One compact line per task: client, title, who, due. */
function TaskRow({ a, showClient, owner, children }: { a: Action; showClient?: boolean; owner?: boolean; children?: React.ReactNode }) {
  const { getClient } = useStore();
  const c = getClient(a.clientId);
  const done = (a.subtasks ?? []).filter((s) => s.done).length;
  const total = (a.subtasks ?? []).length;
  return (
    <Link href={hrefFor(a.clientId, a.id)} className="dash-row">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title ellipsis">{a.title}</div>
        <div className="tiny muted ellipsis">
          {showClient && c && <><span className="dash-dot" style={{ background: c.accent }} aria-hidden="true" />{c.name} · </>}
          {owner ? a.owner.name : a.requestedBy ? `Asked by ${a.requestedBy.name}` : a.kind}
          {total > 0 && ` · ${done}/${total} steps`}
        </div>
      </div>
      {children}
      <ShortDue a={a} />
    </Link>
  );
}

function hrefFor(clientId: string, id: string) {
  return `/c/${clientId}/a/${id}`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
