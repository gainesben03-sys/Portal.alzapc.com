"use client";

import { trainingApi, type ListData as TrainingList } from "@/lib/complianceclient";
import { stageOf as trainingStage } from "@/lib/compliance";
import { useDemo } from "@/components/perform";
import { performApi, type ListData } from "@/lib/performclient";
import { LeaveTile } from "@/components/leaveui";
import { Greeting } from "@/components/greeting";
import { MyListTile } from "@/components/mylist";
import { ContactBenLine } from "@/components/contactben";
import { useLeaveAccess } from "@/lib/leaveclient";
import { AskBox } from "@/components/askbox";
import { OutboxBanner } from "@/components/outbox";
import { DEMO_SITE } from "@/lib/state";

const DEMO_TILES = ["projects", "hires", "reviews", "celebrate"];
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, UrgencyPill, useGuard, useToast } from "@/components/ui";
import { ADVISOR, fmt, fmtTime, ownsOpenWork, parseDay, projectProgress, today, urgency, isAdvisorName } from "@/lib/data";
import { canSee, daysSince, DEFAULT_TILES, Note, TILES } from "@/lib/modules";
import { isRoadmap } from "@/lib/roadmap";
import { RoadmapTile } from "@/components/roadmap";
import { notifyBen, useStore } from "@/lib/store";
import { AskBenSheet } from "@/components/askben";
import { currentStep, HealthChip, projectHealth, StepTrack } from "@/components/projectprogress";
import { hireBadge, hireTasks } from "@/components/hires";
import { canSeeHire, daysUntil, STAGE_SHORT, shortDate } from "@/lib/hires";
import { celebrations } from "@/lib/recognition";

const ORDER = { blocker: 0, overdue: 1, today: 2, soon: 3, later: 4, done: 5 } as const;

function Tile({ title, count, href, linkLabel = "See all", wide, children, tone }: { title: string; count?: ReactNode; href?: string; linkLabel?: string; wide?: boolean; children: ReactNode; tone?: "accent" }) {
  return (
    <section className={`tile-card ${wide ? "wide" : ""} ${tone === "accent" ? "accent" : ""}`}>
      <div className="tile-head">
        <h2>
          {title}
          {count !== undefined && <span className="tile-count">{count}</span>}
        </h2>
        {href && <Link href={href}>{linkLabel}</Link>}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const s = useStore();
  const { actions, projects, rules, viewer, update, getClient, config, me, patch, notes, candidates, roles, files, resources, announcements, bookingUrl, layouts, notice, who, hires } = s;
  const client = getClient(clientId);
  const [editing, setEditing] = useState(false);
  const [previewNote, setPreviewNote] = useState(false);
  const router = useRouter();
  // managers with a team land on their Manager Hub (they can still open Home from the menu)
  const leadsTeam = !!me?.email && s.people.some((p) => p.clientId === clientId && p.active && p.managerEmail.toLowerCase() === me.email.toLowerCase());
  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem("alza-home-ok");
    } catch {}
    if (viewer?.kind === "client" && me?.access === "manager" && leadsTeam && !seen) router.replace(`/c/${clientId}/hub`);
  }, [viewer, me, leadsTeam, clientId, router]);
  // "Exit preview and customize" lands here with ?customize=1
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("customize") === "1" && viewer?.kind === "advisor") {
      setEditing(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [viewer]);
  const leaveAcc = useLeaveAccess(clientId);
  const [asking, setAsking] = useState(false);
  const [askKind, setAskKind] = useState<string | undefined>(undefined);
  const [msg, setMsg] = useState("");
  const toast = useToast();
  if (!ok || !client) return null;

  const cfg = config[client.id];
  const base = `/c/${client.id}`;
  const isAdvisor = viewer?.kind === "advisor";
  const meName = viewer?.kind === "client" ? viewer.person.name : null;
  const layoutKey = me ? `${client.id}:${me.email}` : "";
  const available = TILES.filter((t) => (!t.module || cfg?.modules[t.module]) && (t.id !== "huddle" || !!me) && (t.id !== "leave" || leaveAcc.admin) && (t.id !== "projects" || me?.access !== "manager" || ownsOpenWork(actions, client.id, me?.name)) && (t.id !== "roadmap" || viewer?.kind === "advisor" || me?.access === "exec") && (t.id !== "askhr" || (cfg?.askHr !== false && me?.access !== "hiring")) && (t.module ? canSee(me?.access, t.module) : true));
  const defaults = withNewTiles(cfg?.tiles ?? DEFAULT_TILES).filter((id) => available.some((t) => t.id === id));
  const order = (layoutKey && layouts[layoutKey] && withNewTiles(layouts[layoutKey])) || defaults;
  // public demo: four cards, nothing else, so it reads in seconds
  const shown = DEMO_SITE ? DEMO_TILES.filter((id) => available.some((t) => t.id === id)) : order.filter((id) => available.some((t) => t.id === id));

  // ----- data -----
  const mine = actions.filter((a) => a.clientId === client.id);
  const sort = (l: typeof mine) => [...l].sort((a, b) => ORDER[urgency(a, rules)] - ORDER[urgency(b, rules)] || parseDay(a.due).getTime() - parseDay(b.due).getTime());
  const openClient = sort(mine.filter((a) => a.side === "client" && a.status !== "completed"));
  const forMe = meName ? openClient.filter((a) => a.owner.name === meName) : openClient;
  const overdue = openClient.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules)));
  const dueToday = openClient.filter((a) => urgency(a, rules) === "today");
  const firstName = meName?.split(" ")[0] ?? "HR";

  const sendChat = async () => {
    const text = msg.trim();
    if (!text) return;
    const author = viewer?.kind === "client" ? viewer.person : ADVISOR;
    const n: Note = { id: `n${Date.now()}`, clientId: client.id, author, kind: "Message", text, urgent: false, at: new Date().toISOString(), status: isAdvisor ? "seen" : "new", replies: [] };
    setMsg("");
    const sent = isAdvisor ? false : await notifyBen(`${client.name}: message from ${author.name}`, `${author.name} (${author.role}) wrote:\n\n${text}\n\nReply: https://portal.alzapc.com/console/board`);
    patch({ notes: [{ ...n, emailed: sent }, ...notes] });
    if (!isAdvisor) notice({ clientId: client.id, kind: "note", text: `${author.name} sent a message`, href: "/console/board" });
    toast.show(isAdvisor ? "Posted" : "Sent to HR");
  };

  const tiles: Record<string, () => ReactNode> = {
    tasks: () => {
      const list = (meName ? forMe : openClient).slice(0, 4);
      const teamCount = meName ? openClient.length - forMe.length : 0;
      return (
        <Tile title={meName ? "Needs you" : "Waiting on client"} count={meName ? forMe.length : openClient.length} href={`${base}/tasks`} wide>
          {list.length === 0 && <p className="small muted">Nothing needs you right now.</p>}
          {list.map((a) => (
            <div className="row" key={a.id}>
              <Link href={`${base}/a/${a.id}`} className="grow" style={{ minWidth: 0 }}>
                <div className="title">{a.title}</div>
                <div className="tiny muted">
                  {meName ? "" : `${a.owner.name} · `}
                  {a.subtasks?.length ? `${a.subtasks.filter((x) => x.done).length}/${a.subtasks.length} steps` : a.kind === "approval" ? "Approval" : a.kind === "feedback" ? "Feedback" : a.kind === "todo" ? "To-do" : "Info needed"}
                </div>
              </Link>
              <UrgencyPill a={a} />
              {a.kind === "approval" && !a.subtasks?.some((x) => !x.done) && !isAdvisor && (
                <button className="btn sm primary" onClick={() => { update(a.id, { status: "completed" }, "Approved"); toast.show("Approved. HR has been notified."); }}>Approve</button>
              )}
            </div>
          ))}
          {teamCount > 0 && <Link href={`${base}/tasks`} className="tiny" style={{ color: "var(--blue)", display: "block", marginTop: 10 }}>+ {teamCount} with the rest of your team</Link>}
        </Tile>
      );
    },
    schedule: () => (
      <Tile title="Need something?" tone="accent">
        <p className="small" style={{ marginBottom: 12 }}>A document, a question, an employee situation: send it here and it&apos;s on HR&apos;s list.</p>
        <button className="btn primary block" disabled={isAdvisor} onClick={() => { setAskKind(undefined); setAsking(true); }}>Send a request to HR</button>
        {bookingUrl ? (
          <a className="btn block" style={{ marginTop: 8 }} href={bookingUrl} target="_blank" rel="noopener noreferrer">Book a call</a>
        ) : (
          isAdvisor && <Link href="/console/clients" className="tiny" style={{ color: "var(--blue)", display: "block", marginTop: 8 }}>Add your Calendly link</Link>
        )}
      </Tile>
    ),
    projects: () => {
      if (me?.access === "manager") return tiles.tasks(); // managers see the project tasks that are theirs, not the whole roadmap
      const act = projects.filter((p) => p.clientId === client.id && p.status === "active").sort((a, b) => a.milestoneDue.localeCompare(b.milestoneDue));
      const next = projects.filter((p) => p.clientId === client.id && p.status === "planned").length;
      return (
        <Tile title="Projects" count={act.length} href={`${base}/projects`} linkLabel={next ? `Roadmap (${next} coming up)` : "All projects"} wide>
          {act.length === 0 && <p className="small muted">Nothing in progress right now.{next ? ` ${next} on the roadmap.` : ""}</p>}
          <div className="proj-grid">
            {act.map((p) => {
              const pct = projectProgress(p);
              const cur = currentStep(p);
              return (
                <Link href={`${base}/projects/${p.id}`} key={p.id} className="proj-mini">
                  <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
                    <b className="ellipsis grow">{p.name}</b>
                    <span className="proj-mini-pct">{pct}%</span>
                  </div>
                  <div style={{ marginTop: 8 }}><StepTrack p={p} /></div>
                  <div className="tiny muted ellipsis" style={{ marginTop: 6 }}>
                    {cur >= 0 ? <>Now: <b style={{ color: "var(--ink)", fontWeight: 600 }}>{p.steps[cur].text}</b></> : <>Next: {p.nextMilestone}</>}
                  </div>
                  <div className="row" style={{ marginTop: 8, alignItems: "center", gap: 6 }}>
                    <HealthChip h={projectHealth(p, actions.filter((a) => a.projectId === p.id), rules)} />
                    <span className="tiny muted" style={{ marginLeft: "auto" }}>{fmt(p.milestoneDue)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          {!isAdvisor && (
            <Link href={`${base}/projects?new=1`} className="btn ghost sm" style={{ marginTop: 10 }}>
              + Start a project
            </Link>
          )}
        </Tile>
      );
    },
    chat: () => {
      const feed = notes
        .filter((n) => n.clientId === client.id)
        .flatMap((n) => [{ by: n.author.name, text: n.text, at: n.at, ben: isAdvisorName(n.author.name) }, ...n.replies.map((r) => ({ by: r.by, text: r.text, at: r.at, ben: r.by === ADVISOR.name }))])
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-3);
      return (
        <Tile title="Chat with HR" href={`${base}/board`} linkLabel="Open board">
          <div className="chat">
            {feed.length === 0 && <p className="small muted">No messages yet. Say hi.</p>}
            {feed.map((m, i) => (
              <div key={i} className={`bubble ${m.ben ? "ben" : "them"}`}>
                <div>{m.text}</div>
                <div className="tiny muted">{m.ben ? "HR" : m.by.split(" ")[0]} · {fmtTime(m.at)}</div>
              </div>
            ))}
          </div>
          <form style={{ display: "flex", gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
            <input className="f" placeholder="Message HR" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="btn primary" disabled={!msg.trim()}>Send</button>
          </form>
        </Tile>
      );
    },
    askhr: () => (
      <Tile title="Ask HR" href={`${base}/hub/ask`} linkLabel="Open">
        <AskBox clientId={client.id} tile />
      </Tile>
    ),
    share: () => {
      const reqs = openClient.filter((a) => a.kind === "document" || a.kind === "information");
      const sent = files.filter((f) => f.clientId === client.id).length;
      return (
        <Tile title="Send files" href={`${base}/share`} linkLabel="Upload">
          <p className="small muted" style={{ marginBottom: 10 }}>Send documents securely. No email attachments.</p>
          {reqs.slice(0, 2).map((r) => (
            <Link href={`${base}/share`} className="row" key={r.id}>
              <div className="grow ellipsis small"><b>HR asked for:</b> {r.title}</div>
              <span className="tiny muted">{fmt(r.due)}</span>
            </Link>
          ))}
          <Link href={`${base}/share`} className="btn block" style={{ marginTop: 10 }}>Upload a document</Link>
          <div className="tiny muted" style={{ marginTop: 8, textAlign: "center" }}>{sent} sent so far</div>
        </Tile>
      );
    },
    recruiting: () => {
      const myRoles = roles.filter((r) => r.clientId === client.id);
      const waiting = candidates.filter((c) => !c.decision && !c.cleared && myRoles.some((r) => r.id === c.roleId));
      return (
        <Tile title="Hiring" count={myRoles.length} href={`${base}/recruiting`}>
          {myRoles.map((r) => {
            const w = waiting.filter((c) => c.roleId === r.id);
            return (
              <Link href={`${base}/recruiting`} className="row" key={r.id}>
                <div className="grow">
                  <div className="title">{r.title}</div>
                  <div className="tiny muted">{r.status}</div>
                </div>
                {w.length > 0 && <span className={`pill ${w.some((c) => c.otherOffers) ? "overdue" : "soon"}`}>{w.length} need feedback</span>}
              </Link>
            );
          })}
          {waiting.length > 0 && <p className="tiny muted" style={{ marginTop: 8 }}>Longest wait: {Math.max(...waiting.map((c) => daysSince(c.sentAt)))} days</p>}
        </Tile>
      );
    },
    hires: () => {
      const recent = (h: (typeof hires)[number]) => h.status === "Started" && !!h.startDate && daysUntil(h.startDate) >= -14;
      const who = { advisor: isAdvisor, access: me?.access, name: meName ?? "" };
      const all = me?.access === "manager" || me?.access === "hiring";
      const list = hires
        .filter((h) => h.clientId === client.id && canSeeHire(h, who) && (h.status !== "Started" || recent(h)))
        .sort((a, b) => (a.status === "Started" ? 1 : 0) - (b.status === "Started" ? 1 : 0) || (a.startDate || "9999").localeCompare(b.startDate || "9999"));
      const inProgress = list.filter((h) => h.status !== "Started");
      const thisMonth = inProgress.filter((h) => h.startDate && daysUntil(h.startDate) >= 0 && daysUntil(h.startDate) <= 30).length;
      return (
        <Tile title={all ? "My new hires" : "New hires"} count={inProgress.length} href={`${base}/hires`} linkLabel={all ? "Open" : "All new hires"} wide>
          {inProgress.length > 0 && <p className="tiny muted" style={{ margin: "-4px 0 6px" }}>{inProgress.length} in progress{thisMonth ? `, ${thisMonth} starting in the next 30 days` : ""}.</p>}
          {list.length === 0 && <p className="small muted">{all ? "No new hires on your team right now." : "No one in progress. Start a new hire when you're ready to make an offer."}</p>}
          <div className="nh-list">
            {list.slice(0, 8).map((h) => {
              const b = hireBadge(h, hireTasks(h, actions), rules);
              const n = h.startDate ? daysUntil(h.startDate) : null;
              return (
                <Link key={h.id} href={`${base}/hires/${h.id}`} className="nh-row">
                  <span className="nh-who">
                    <b>{h.name || "New hire"}</b>
                    <span className="tiny muted">{[h.title, all ? "" : h.managerName && `with ${h.managerName.split(" ")[0]}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="nh-stage tiny"><b>{STAGE_SHORT[h.status]}</b></span>
                  <span className="nh-when">
                    <b className="small">{h.startDate ? shortDate(h.startDate) : "No date"}</b>
                    <span className="tiny muted">{n === null ? "" : n > 1 ? `in ${n} days` : n === 1 ? "tomorrow" : n === 0 ? "today" : "started"}</span>
                  </span>
                  <span className={`health-chip h-${b.tone}`}><span className="dot" />{b.label}</span>
                </Link>
              );
            })}
          </div>
          {list.length > 8 && <Link href={`${base}/hires`} className="tiny" style={{ display: "block", marginTop: 8, color: "var(--blue)" }}>See all {list.length}</Link>}
          {(isAdvisor || me?.access === "exec") && <Link href={`${base}/hires/new`} className="btn ghost sm" style={{ marginTop: 10, display: "inline-flex" }}>+ Add a new hire</Link>}
        </Tile>
      );
    },
    celebrate: () => {
      const myEmail = (me?.email || "").toLowerCase();
      const team = s.people.filter((p) => p.clientId === client.id && p.active && (isAdvisor || me?.access === "exec" || p.managerEmail.toLowerCase() === myEmail));
      const list = celebrations(team, new Date(), 30).sort((a, b) => a.days - b.days);
      const scope = isAdvisor || me?.access === "exec" ? "company" : "team";
      const ICON = { birthday: "🎂", anniversary: "🎉", new: "👋" } as const;
      const what = (c: (typeof list)[number]) => (c.kind === "birthday" ? "Birthday" : c.kind === "anniversary" ? `${c.years} year${c.years === 1 ? "" : "s"} here` : c.days >= 0 ? "Starts" : "Just started");
      const when = (c: (typeof list)[number]) => (c.days === 0 ? "Today" : c.days === 1 ? "Tomorrow" : c.when);
      return (
        <Tile title="Celebrations" count={list.length || undefined} href={cfg?.modules.recognition ? `${base}/recognition` : undefined} linkLabel="Team Wall">
          {list.length === 0 && <p className="small muted" style={{ margin: 0 }}>No birthdays, work anniversaries or new starters on your {scope} in the next 30 days.</p>}
          {list.slice(0, 7).map((c) => (
            <div key={c.kind + c.personId} className="cel-row">
              <span aria-hidden="true">{ICON[c.kind]}</span>
              <span className="grow" style={{ minWidth: 0 }}><b className="small">{c.name}</b> <span className="tiny muted">· {what(c)}</span></span>
              <span className={`tiny ${c.days <= 1 ? "cel-soon" : "muted"}`}>{when(c)}</span>
            </div>
          ))}
          {list.length > 7 && <p className="tiny muted" style={{ margin: "6px 0 0" }}>+{list.length - 7} more this month</p>}
        </Tile>
      );
    },
    roadmap: () => <RoadmapTile clientId={client.id} />,
    upcoming: () => {
      const up = projects.filter((p) => p.clientId === client.id && p.status === "planned" && (!isRoadmap(p) || viewer?.kind === "advisor" || me?.access === "exec")).sort((a, b) => a.milestoneDue.localeCompare(b.milestoneDue)).slice(0, 3);
      return (
        <Tile title="Coming up" href={`${base}/projects`} linkLabel="Roadmap">
          {up.length === 0 && <p className="small muted">Nothing scheduled yet.</p>}
          {up.map((p) => (
            <div className="row" key={p.id}>
              <div className="grow title ellipsis">{p.name}</div>
              <span className="tiny muted">{parseDay(p.milestoneDue).toLocaleDateString("en-US", { month: "short" })}</span>
            </div>
          ))}
        </Tile>
      );
    },
    wins: () => {
      const since = new Date(today().getTime() - 30 * 86400000);
      const w = [
        ...mine.filter((a) => a.status === "completed" && a.completedAt && new Date(a.completedAt) >= since).map((a) => ({ t: a.title, d: a.completedAt! })),
        ...projects.filter((p) => p.clientId === client.id && p.status === "done" && parseDay(p.milestoneDue) >= since).map((p) => ({ t: `${p.name} wrapped up`, d: p.milestoneDue })),
      ]
        .sort((a, b) => b.d.localeCompare(a.d))
        .slice(0, 4);
      return (
        <Tile title="Recent wins" count={w.length} href={`${base}/projects`} linkLabel="All completed">
          {w.length === 0 && <p className="small muted">Wins show up here as things get done.</p>}
          {w.map((x, i) => (
            <div className="row" key={i}>
              <div className="grow small"><span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span> {x.t}</div>
              <span className="tiny muted">{fmt(x.d)}</span>
            </div>
          ))}
        </Tile>
      );
    },
    alza: () => {
      const list = sort(mine.filter((a) => a.side === "alza" && a.status !== "completed"));
      return (
        <Tile title="In progress" count={list.length} href={`${base}/tasks`}>
          {list.length === 0 && <p className="small muted">Nothing in progress right now.</p>}
          {list.map((a) => (
            <Link href={`${base}/a/${a.id}`} className="row" key={a.id}>
              <div className="grow">
                <div className="title ellipsis">{a.title}</div>
                <div className="tiny muted">{a.status === "blocked" ? "Waiting on your team first" : `Target ${fmt(a.due)}`}</div>
              </div>
            </Link>
          ))}
        </Tile>
      );
    },
    resources: () => {
      const list = resources.flatMap((r) => r.shares.filter((x) => x.clientId === client.id).map((x) => ({ r, x }))).sort((a, b) => b.x.at.localeCompare(a.x.at)).slice(0, 3);
      return (
        <Tile title="Resources" href={`${base}/resources`}>
          {list.length === 0 && <p className="small muted">Nothing shared yet.</p>}
          {list.map(({ r, x }) => (
            <Link href={`${base}/resources`} className="row" key={r.id + x.folder}>
              <div className="grow"><div className="title ellipsis">{r.title}</div><div className="tiny muted">{x.folder}</div></div>
            </Link>
          ))}
        </Tile>
      );
    },
    wellness: () => {
      const a = announcements[0];
      return (
        <Tile title="Wellness" href={`${base}/wellness`} linkLabel="Programs">
          {a ? (<><b className="small">{a.title}</b><p className="small muted" style={{ marginTop: 4 }}>{a.body}</p></>) : <p className="small muted">See the programs available to your team.</p>}
        </Tile>
      );
    },
    leave: () => <LeaveTile clientId={client.id} Tile={Tile} />,
    reviews: () => <ReviewsTile clientId={client.id} />,
    compliance: () => <TrainingTile clientId={client.id} />,
    mylist: () => <MyListTile clientId={client.id} Tile={Tile} />,
    huddle: () =>
      me && cfg ? (
        <Tile title="The People Brief">
          <label className="rule" style={{ cursor: "pointer" }}>
            <span className="switch">
              <input
                type="checkbox"
                checked={cfg.huddle.recipients.includes(me.email)}
                onChange={(e) => {
                  const r = cfg.huddle.recipients;
                  patch({ config: { ...config, [client.id]: { ...cfg, huddle: { ...cfg.huddle, recipients: e.target.checked ? [...r, me.email] : r.filter((x) => x !== me.email) } } } });
                }}
              />
              <span />
            </span>
            <span className="small muted">A weekly briefing: what needs you, your people, and where HR priorities stand. Quiet weeks are skipped.</span>
          </label>
        </Tile>
      ) : null,
  };

  const saveLayout = (ids: string[]) => {
    if (isAdvisor) patch({ config: { ...config, [client.id]: { ...cfg, tiles: ids } } });
    else if (layoutKey) patch({ layouts: { ...layouts, [layoutKey]: ids } });
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        <Greeting clientId={client.id} onCustomize={() => (s.preview ? setPreviewNote(true) : setEditing(true))} />
        {!DEMO_SITE && <OutboxBanner clientId={client.id} advisor={isAdvisor} exec={me?.access === "exec"} />}

        {/* Ask HR lives in Resources; here only when Resources is off */}
        {!DEMO_SITE && !cfg.modules?.resources && !shown.includes("askhr") && <AskBox clientId={client.id} slim />}

        <NeedsAttention clientId={client.id} base={base} overdue={meName ? forMe.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules))) : overdue} isAdvisor={isAdvisor} meName={meName} />
        {!DEMO_SITE && <Workspace clientId={client.id} base={base} />}

        <Dash>
          {shown.map((id) => <div key={id} className={TILES.find((t) => t.id === id)?.wide ? "span2" : ""}>{tiles[id]?.()}</div>)}
        </Dash>
        {!DEMO_SITE && cfg?.softAsks !== false && <QuietAsks clientName={client.name} recruitingOn={!!cfg?.modules.recruiting} onSend={async (kind, text) => {
          const author = viewer?.kind === "client" ? viewer.person : ADVISOR;
          const n: Note = { id: `n${Date.now()}`, clientId: client.id, author, kind: "Message", text, urgent: false, at: new Date().toISOString(), status: "new", replies: [] };
          const sent = isAdvisor ? false : await notifyBen(`${client.name}: ${kind === "referral" ? "an introduction" : "a hiring need"} from ${author.name}`, `${author.name} (${author.role}) at ${client.name}:\n\n${text}`);
          patch({ notes: [{ ...n, emailed: sent }, ...notes] });
          if (!isAdvisor) notice({ clientId: client.id, kind: "note", text: `${author.name} ${kind === "referral" ? "sent an introduction" : "mentioned a hiring need"}`, href: "/console/board" });
          toast.show(kind === "referral" ? "Thank you. HR will take it from here." : "Sent. HR will follow up.");
        }} />}
        {!DEMO_SITE && <p className="demo-note">Fictional sample data for the prototype.</p>}
        {!isAdvisor && !DEMO_SITE && <ContactBenLine />}
      </main>

      {previewNote && (
        <Sheet title="Customize is off in preview" onClose={() => setPreviewNote(false)}>
          <p className="small">Nothing can be changed while you&apos;re viewing as {s.preview?.name}. To change which tiles {client.name}&apos;s people see, set their default tiles as yourself.</p>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setPreviewNote(false)}>Stay in preview</button>
            <button
              className="btn primary sm"
              onClick={() => {
                s.setPreview(null);
                setPreviewNote(false);
                router.replace(`/c/${client.id}`);
                setEditing(true);
              }}
            >
              Exit and set default tiles
            </button>
          </div>
        </Sheet>
      )}
      {editing && (
        <CustomizeSheet
          title={isAdvisor ? `Default tiles for ${client.name}` : "Customize your dashboard"}
          note={isAdvisor ? "This is the starting layout for everyone at this client. People can still adjust their own." : "Only changes your view."}
          available={available}
          order={shown}
          onClose={() => setEditing(false)}
          onSave={(ids) => { saveLayout(ids); setEditing(false); toast.show("Dashboard updated"); }}
          onReset={() => {
            if (isAdvisor) patch({ config: { ...config, [client.id]: { ...cfg, tiles: undefined } } });
            else if (layoutKey) { const n = { ...layouts }; delete n[layoutKey]; patch({ layouts: n }); }
            setEditing(false);
            toast.show("Back to the default layout");
          }}
        />
      )}
      {asking && <AskBenSheet clientId={client.id} startKind={askKind} onClose={() => setAsking(false)} onDone={(m) => { setAsking(false); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

/** The tile grid packs tiles by their real height, so a short tile never leaves a tall empty card beside a long one. */
function Dash({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const fit = () => {
      const packed = getComputedStyle(grid).getPropertyValue("--packed").trim() === "1";
      for (const el of Array.from(grid.children) as HTMLElement[]) {
        const inner = el.firstElementChild as HTMLElement | null;
        if (!packed || !inner) { el.style.gridRowEnd = ""; continue; }
        el.style.gridRowEnd = `span ${Math.ceil((inner.getBoundingClientRect().height + 12) / 4)}`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    const watch = () => { ro.disconnect(); ro.observe(grid); for (const el of Array.from(grid.children)) if (el.firstElementChild) ro.observe(el.firstElementChild); };
    watch();
    const mo = new MutationObserver(() => { watch(); fit(); });
    mo.observe(grid, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return <div ref={ref} className="dash packed section" style={{ marginTop: 16 }}>{children}</div>;
}

/** Tiles added after people may have saved a layout. They appear on saved layouts too, unless someone turned them off. */
const NEW_TILES: [string, string][] = [["askhr", "projects"], ["mylist", "projects"], ["leave", "hires"], ["reviews", "recruiting"], ["celebrate", "mylist"], ["compliance", "reviews"], ["roadmap", "projects"]]; // [tile, show it after]
function withNewTiles(saved: string[]): string[] {
  const out = saved.filter((id) => !id.startsWith("!"));
  for (const [id, after] of NEW_TILES) {
    if (saved.includes(id) || saved.includes(`!${id}`)) continue;
    const at = out.indexOf(after);
    out.splice(at >= 0 ? at + 1 : 0, 0, id);
  }
  return out;
}

/** Turning a tile on puts it back where it normally sits (not at the bottom); turning it off leaves it in place. */
function toggle(list: { id: string; on: boolean }[], id: string) {
  const item = list.find((x) => x.id === id)!;
  if (item.on) return list.map((x) => (x.id === id ? { ...x, on: false } : x));
  const rank = (tid: string) => {
    const d = DEFAULT_TILES.indexOf(tid);
    return d >= 0 ? d : DEFAULT_TILES.length + TILES.findIndex((t) => t.id === tid);
  };
  const rest = list.filter((x) => x.id !== id);
  const ons = rest.filter((x) => x.on);
  // first switched-on tile that normally comes after this one
  const before = ons.find((x) => rank(x.id) > rank(id));
  const at = before ? rest.indexOf(before) : rest.filter((x) => x.on).length ? rest.indexOf(ons[ons.length - 1]) + 1 : 0;
  rest.splice(at, 0, { id, on: true });
  return rest;
}

function CustomizeSheet({ title, note, available, order, onClose, onSave, onReset }: { title: string; note: string; available: typeof TILES; order: string[]; onClose: () => void; onSave: (ids: string[]) => void; onReset: () => void }) {
  const [list, setList] = useState<{ id: string; on: boolean }[]>(() => [
    ...order.map((id) => ({ id, on: true })),
    ...available.filter((t) => !order.includes(t.id)).map((t) => ({ id: t.id, on: false })),
  ]);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    setList(n);
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="tiny muted" style={{ marginTop: -6 }}>{note}</p>
      <div style={{ maxHeight: "55vh", overflow: "auto", marginTop: 8 }}>
        {list.map((x, i) => {
          const t = available.find((a) => a.id === x.id)!;
          return (
            <div className="check" key={x.id} style={{ alignItems: "center" }}>
              <input type="checkbox" checked={x.on} onChange={() => setList(toggle(list, x.id))} aria-label={`Show ${t.label}`} />
              <span style={{ flex: 1 }}>
                <b className="small">{t.label}</b>
                <span className="tiny muted" style={{ display: "block", textDecoration: "none" }}>{t.blurb}</span>
              </span>
              <button className="btn ghost sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost sm" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
            </div>
          );
        })}
      </div>
      <label className="row small" style={{ gap: 8, alignItems: "center", marginTop: 12 }}>
        <input type="checkbox" defaultChecked={(() => { try { return localStorage.getItem("alza-line-on") === "1"; } catch { return false; } })()} onChange={(e) => { try { localStorage.setItem("alza-line-on", e.target.checked ? "1" : "0"); } catch {} window.dispatchEvent(new Event("alza-line")); }} />
        Show a daily quote under the greeting
      </label>
      <div className="sheet-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn ghost sm" onClick={onReset}>Reset to default</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave([...list.filter((x) => x.on).map((x) => x.id), ...list.filter((x) => !x.on).map((x) => `!${x.id}`)])}>Save</button>
        </div>
      </div>
    </Sheet>
  );
}

function QuietAsks({ clientName, recruitingOn, onSend }: { clientName: string; recruitingOn: boolean; onSend: (kind: "referral" | "hiring", text: string) => void }) {
  const [open, setOpen] = useState<null | "referral" | "hiring">(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const close = () => { setOpen(null); setA(""); setB(""); setC(""); };
  return (
    <>
      <div className="quiet">
        <div>
          Know a company that could use a hand with HR? Introductions from people like you are how most of our work starts.{" "}
          <button onClick={() => setOpen("referral")}>Make an intro</button>
        </div>
        {!recruitingOn && (
          <div>
            Hiring soon? We can run the search too.{" "}
            <button onClick={() => setOpen("hiring")}>Tell us about the role</button>
          </div>
        )}
      </div>
      {open === "referral" && (
        <Sheet title="Make an introduction" onClose={close}>
          <p className="small muted" style={{ marginTop: -4 }}>No pressure on them. We&apos;ll reach out once, mention you, and keep it low key.</p>
          <label className="f">Their name and company</label>
          <input className="f" value={a} onChange={(e) => setA(e.target.value)} placeholder="Jordan at Northwind Studio" />
          <label className="f">Best way to reach them (optional)</label>
          <input className="f" value={b} onChange={(e) => setB(e.target.value)} placeholder="Email or phone, or say you'll connect us" />
          <label className="f">Anything HR should know (optional)</label>
          <textarea className="f" value={c} onChange={(e) => setC(e.target.value)} placeholder="Growing fast, no HR person yet" />
          <div className="sheet-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" disabled={!a.trim()} onClick={() => { onSend("referral", `Introduction: ${a.trim()}${b.trim() ? `\nReach: ${b.trim()}` : ""}${c.trim() ? `\nContext: ${c.trim()}` : ""}`); close(); }}>Send to HR</button>
          </div>
        </Sheet>
      )}
      {open === "hiring" && (
        <Sheet title="Tell HR about the role" onClose={close}>
          <p className="small muted" style={{ marginTop: -4 }}>Just the basics. HR will follow up with how a search would work for {clientName}.</p>
          <label className="f">Role</label>
          <input className="f" value={a} onChange={(e) => setA(e.target.value)} placeholder="Senior Producer" />
          <label className="f">When do you want them started?</label>
          <input className="f" value={b} onChange={(e) => setB(e.target.value)} placeholder="Early next quarter" />
          <label className="f">Anything else (optional)</label>
          <textarea className="f" value={c} onChange={(e) => setC(e.target.value)} />
          <div className="sheet-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" disabled={!a.trim()} onClick={() => { onSend("hiring", `Hiring need: ${a.trim()}${b.trim() ? `\nTiming: ${b.trim()}` : ""}${c.trim() ? `\nNotes: ${c.trim()}` : ""}`); close(); }}>Send to HR</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Reviews at a glance for executives and HR: counts only, each one a link. */
function ReviewsTile({ clientId }: { clientId: string }) {
  const demo = useDemo(clientId);
  const [d, setD] = useState<ListData | null>(null);
  useEffect(() => {
    performApi(clientId, { action: "list" }, demo).then((r) => r.ok && setD(r as ListData)).catch(() => undefined);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = `/c/${clientId}/reviews`;
  if (!d) return <Tile title="Reviews" href={base}><p className="small muted">Loading…</p></Tile>;
  const sum = (k: "overdue" | "waiting" | "total" | "done") => d.insight.reduce((n, r) => n + r[k], 0);
  const overdue = sum("overdue");
  const waiting = sum("waiting");
  const toWrite = Math.max(0, sum("total") - sum("done") - waiting);
  const soon = d.upcoming.filter((u) => (new Date(u.due + "T12:00").getTime() - Date.now()) / 864e5 <= 30).length;
  const lines: [string, number, string, boolean][] = [
    ["Past due", overdue, base, true],
    ["In progress", Math.max(0, toWrite - overdue), base, false],
    ["Awaiting employee sign-off", waiting, base, false],
    ["Due in the next 30 days", soon, base, false],
    ...(d.role.admin ? ([[`Flagged for an improvement plan`, d.pipFlags.length, base, true]] as [string, number, string, boolean][]) : []),
  ];
  const any = lines.some(([, n]) => n > 0);
  return (
    <Tile title="Reviews" count={overdue || undefined} href={base} linkLabel="Open reviews">
      {!any && <p className="small muted" style={{ margin: 0 }}>Nothing due. Reviews show up here a month before they&apos;re due.</p>}
      {lines.filter(([, n]) => n > 0).map(([label, n, href, bad]) => (
        <Link key={label} href={href} className="st-line">
          <span className={`st-dot ${bad ? "red" : label.startsWith("Awaiting") ? "amber" : label.startsWith("In progress") ? "blue" : ""}`} aria-hidden="true" />
          <span className="grow">{label}</span>
          <b>{n}</b>
          <span className="st-go" aria-hidden="true">›</span>
        </Link>
      ))}
    </Tile>
  );
}

/** Required training at a glance: how many are current, late, or waiting on HR. */
function TrainingTile({ clientId }: { clientId: string }) {
  const { people, viewer, me } = useStore();
  const admin = viewer?.kind !== "client" || me?.access === "exec";
  const demo = { people, me: { email: viewer?.kind === "client" ? (me?.email ?? "") : "ben@alzapc.com", admin } };
  const [d, setD] = useState<TrainingList | null>(null);
  useEffect(() => {
    trainingApi(clientId, { action: "list" }, demo).then((r) => r.ok && setD(r as TrainingList)).catch(() => undefined);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = `/c/${clientId}/training/required`;
  if (!d) return <Tile title="Required training" href={base}><p className="small muted">Loading…</p></Tile>;
  const open = d.records.filter((r) => r.status !== "cancelled");
  const latest = new Map<string, (typeof open)[number]>();
  for (const r of open) { const k = `${r.personId}|${r.courseId}`; const c = latest.get(k); if (!c || ["assigned", "sentback", "submitted"].includes(r.status) || (r.completedAt ?? "") > (c.completedAt ?? "")) latest.set(k, r); }
  const all = [...latest.values()];
  const st = all.map((r) => trainingStage(r, d.today));
  const pct = all.length ? Math.round((st.filter((x) => x === "current").length / all.length) * 100) : 0;
  const late = st.filter((x) => x === "late").length;
  const checking = st.filter((x) => x === "checking").length;
  const soon = st.filter((x) => x === "due_soon").length;
  return (
    <Tile title={admin ? "Required training" : "Your team's training"} count={late || undefined} href={base} linkLabel="Open">
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}><span className="tr-pct">{pct}%</span><span className="small muted">current</span></div>
      <span className="pf-bar" style={{ width: "100%", margin: "8px 0 4px" }}><span style={{ width: `${pct}%` }} /></span>
      {late > 0 && <Link href={base} className="lv-line"><span className="grow"><b>{late}</b> <span className="muted">late</span></span><span className="pill overdue">Late</span></Link>}
      {admin && checking > 0 && <Link href={`${base}?tab=certificates`} className="lv-line"><span className="grow"><b>{checking}</b> <span className="muted">certificate{checking === 1 ? "" : "s"} to check</span></span><span className="pill overdue">Act</span></Link>}
      {soon > 0 && <Link href={base} className="lv-line"><span className="grow"><b>{soon}</b> <span className="muted">due in the next 60 days</span></span></Link>}
      {!late && !(admin && checking) && !soon && <p className="small muted" style={{ margin: "6px 0 0" }}>Everyone is current. Nothing due soon.</p>}
      {admin && !d.settings.live && <p className="tiny muted" style={{ margin: "6px 0 0" }}>Not launched yet. Nothing has been emailed.</p>}
    </Tile>
  );
}

/** The one question the dashboard answers first: what needs me? A short list, each row goes straight to it. */
function NeedsAttention({ clientId, base, overdue, isAdvisor, meName }: { clientId: string; base: string; overdue: { id: string; title: string }[]; isAdvisor: boolean; meName: string | null }) {
  const { hires, actions, rules, candidates, roles, me, config } = useStore();
  const demo = useDemo(clientId);
  const [rev, setRev] = useState<{ overdue: number; pip: number } | null>(null);
  const cfg = config[clientId];
  useEffect(() => {
    if (!cfg?.modules?.perform || me?.access === "hiring") return;
    performApi(clientId, { action: "list" }, demo).then((r) => {
      if (!r.ok) return;
      const d = r as ListData;
      setRev({ overdue: d.insight.reduce((n, x) => n + x.overdue, 0), pip: d.role.admin ? d.pipFlags.length : 0 });
    }).catch(() => undefined);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = { advisor: isAdvisor, access: me?.access, name: meName ?? "" };
  const items: { key: string; text: string; href: string; tone: "red" | "amber" }[] = [];
  if (overdue.length === 1) items.push({ key: "t", text: `Overdue: ${overdue[0].title}`, href: `${base}/a/${overdue[0].id}`, tone: "red" });
  else if (overdue.length > 1) items.push({ key: "t", text: `${overdue.length} overdue tasks`, href: `${base}/tasks`, tone: "red" });
  for (const h of hires.filter((x) => x.clientId === clientId && x.status !== "Started" && canSeeHire(x, who))) {
    const b = hireBadge(h, hireTasks(h, actions), rules);
    if (b.tone !== "red") continue;
    const f = (h.firstName || h.name || "New hire").split(" ")[0];
    items.push({ key: `h${h.id}`, text: b.label === "Tight for the start date" ? `${f} starts soon, onboarding is behind` : `${f}'s onboarding needs you`, href: `${base}/hires/${h.id}`, tone: "red" });
  }
  if (cfg?.modules?.recruiting && me?.access !== "manager") {
    const mine = roles.filter((r) => r.clientId === clientId).map((r) => r.id);
    const waiting = candidates.filter((c) => mine.includes(c.roleId) && !c.hidden && !c.cleared && !c.decision).length;
    if (waiting) items.push({ key: "c", text: `${waiting} candidate${waiting === 1 ? "" : "s"} waiting on a yes or no`, href: `${base}/recruiting`, tone: "amber" });
  }
  if (rev?.overdue) items.push({ key: "r", text: `${rev.overdue} review${rev.overdue === 1 ? "" : "s"} past due`, href: `${base}/reviews`, tone: "red" });
  if (rev?.pip) items.push({ key: "p", text: `${rev.pip} flagged for an improvement plan`, href: `${base}/reviews`, tone: "amber" });
  const list = [...items.filter((x) => x.tone === "red"), ...items.filter((x) => x.tone === "amber")].slice(0, 5);
  return (
    <section className="na" aria-labelledby="na-h">
      <h2 id="na-h" className="na-h">Needs your attention{list.length > 0 && <span className="na-n">{items.length}</span>}</h2>
      {list.length === 0 ? (
        <p className="na-clear">You&apos;re all caught up.</p>
      ) : (
        <div className="na-list">
          {list.map((x) => (
            <Link key={x.key} href={x.href} className="na-row">
              <span className={`st-dot ${x.tone}`} aria-hidden="true" />
              <span className="grow">{x.text}</span>
              <span className="st-go" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Quick ways into the main areas. Only what this company has turned on. */
function Workspace({ clientId, base }: { clientId: string; base: string }) {
  const { config, viewer, me, actions, hires } = useStore();
  const cfg = config[clientId];
  const isAdvisor = viewer?.kind === "advisor";
  const lead = isAdvisor || me?.access === "exec";
  const m = (k: string) => !!(cfg?.modules as Record<string, boolean> | undefined)?.[k] && canSee(me?.access, k as never);
  const open = actions.filter((a) => a.clientId === clientId && a.side === "client" && a.status !== "completed").length;
  const ic = (d: string) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  const items: { label: string; href: string; meta?: string; icon: ReactNode }[] = [
    { label: "Action Center", href: `${base}/tasks`, meta: open ? `${open} open` : undefined, icon: ic("M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9") },
    { label: "Projects", href: `${base}/projects`, icon: ic("M3 7h18M3 12h12M3 17h8") },
    ...(lead ? [{ label: "People", href: `${base}/roster`, icon: ic("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8") }] : []),
    ...(cfg?.modules.perform && me?.access !== "hiring" ? [{ label: "Reviews", href: `${base}/reviews`, icon: ic("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z") }] : []),
    ...(m("hires") ? [{ label: "New hires", href: `${base}/hires`, meta: (() => { const n = hires.filter((h) => h.clientId === clientId && h.status !== "Started").length; return n ? `${n} in progress` : undefined; })(), icon: ic("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6") }] : []),
    ...(m("recruiting") ? [{ label: "Recruiting", href: `${base}/recruiting`, icon: ic("M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14") }] : []),
  ].slice(0, 6);
  return (
    <nav className="ws" aria-label="Workspace">
      {items.map((x) => (
        <Link key={x.label} href={x.href} className="ws-item">
          <span className="ws-ic">{x.icon}</span>
          <span className="ws-t"><b>{x.label}</b>{x.meta && <small>{x.meta}</small>}</span>
        </Link>
      ))}
    </nav>
  );
}
