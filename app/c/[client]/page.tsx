"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ReactNode, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, UrgencyPill, useGuard, useToast } from "@/components/ui";
import { ADVISOR, fmt, fmtTime, parseDay, projectProgress, today, urgency } from "@/lib/data";
import { canSee, daysSince, DEFAULT_TILES, Note, TILES } from "@/lib/modules";
import { notifyBen, useStore } from "@/lib/store";
import { AskBenSheet } from "@/components/askben";
import { currentStep, HealthChip, projectHealth, StepTrack } from "@/components/projectprogress";
import { Tracker, startsIn } from "@/components/hires";
import { shortDate } from "@/lib/hires";

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
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const toast = useToast();
  if (!ok || !client) return null;

  const cfg = config[client.id];
  const base = `/c/${client.id}`;
  const isAdvisor = viewer?.kind === "advisor";
  const meName = viewer?.kind === "client" ? viewer.person.name : null;
  const layoutKey = me ? `${client.id}:${me.email}` : "";
  const available = TILES.filter((t) => (!t.module || cfg?.modules[t.module]) && (t.id !== "huddle" || !!me) && (t.module ? canSee(me?.access, t.module) : true));
  const defaults = (cfg?.tiles ?? DEFAULT_TILES).filter((id) => available.some((t) => t.id === id));
  const order = (layoutKey && layouts[layoutKey]) || defaults;
  const shown = order.filter((id) => available.some((t) => t.id === id));

  // ----- data -----
  const mine = actions.filter((a) => a.clientId === client.id);
  const sort = (l: typeof mine) => [...l].sort((a, b) => ORDER[urgency(a, rules)] - ORDER[urgency(b, rules)] || parseDay(a.due).getTime() - parseDay(b.due).getTime());
  const openClient = sort(mine.filter((a) => a.side === "client" && a.status !== "completed"));
  const forMe = meName ? openClient.filter((a) => a.owner.name === meName) : openClient;
  const overdue = openClient.filter((a) => ["overdue", "blocker"].includes(urgency(a, rules)));
  const dueToday = openClient.filter((a) => urgency(a, rules) === "today");
  const firstName = meName?.split(" ")[0] ?? "Ben";

  const sendChat = async () => {
    const text = msg.trim();
    if (!text) return;
    const author = viewer?.kind === "client" ? viewer.person : ADVISOR;
    const n: Note = { id: `n${Date.now()}`, clientId: client.id, author, kind: "Message", text, urgent: false, at: new Date().toISOString(), status: isAdvisor ? "seen" : "new", replies: [] };
    setMsg("");
    const sent = isAdvisor ? false : await notifyBen(`${client.name}: message from ${author.name}`, `${author.name} (${author.role}) wrote:\n\n${text}\n\nReply: https://portal.alzapc.com/console/board`);
    patch({ notes: [{ ...n, emailed: sent }, ...notes] });
    if (!isAdvisor) notice({ clientId: client.id, kind: "note", text: `${author.name} sent a message`, href: "/console/board" });
    toast.show(isAdvisor ? "Posted" : "Sent to Ben");
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
                  {a.subtasks?.length ? `${a.subtasks.filter((x) => x.done).length}/${a.subtasks.length} steps` : a.kind === "approval" ? "Approval" : a.kind === "feedback" ? "Feedback" : "Info needed"}
                </div>
              </Link>
              <UrgencyPill a={a} />
              {a.kind === "approval" && !a.subtasks?.some((x) => !x.done) && !isAdvisor && (
                <button className="btn sm primary" onClick={() => { update(a.id, { status: "completed" }, "Approved"); toast.show("Approved. Ben has been notified."); }}>Approve</button>
              )}
            </div>
          ))}
          {teamCount > 0 && <Link href={`${base}/tasks`} className="tiny" style={{ color: "var(--blue)", display: "block", marginTop: 10 }}>+ {teamCount} with the rest of your team</Link>}
        </Tile>
      );
    },
    schedule: () => (
      <Tile title="Ask Ben" tone="accent">
        <p className="small" style={{ marginBottom: 12 }}>A document, a question, an employee situation: send it here and it&apos;s on Ben&apos;s list.</p>
        <button className="btn primary block" disabled={isAdvisor} onClick={() => setAsking(true)}>Ask Ben for something</button>
        {bookingUrl ? (
          <a className="btn block" style={{ marginTop: 8 }} href={bookingUrl} target="_blank" rel="noopener noreferrer">Book a call</a>
        ) : (
          isAdvisor && <Link href="/console/clients" className="tiny" style={{ color: "var(--blue)", display: "block", marginTop: 8 }}>Add your Calendly link</Link>
        )}
      </Tile>
    ),
    projects: () => {
      const act = projects.filter((p) => p.clientId === client.id && p.status === "active");
      return (
        <Tile title="Projects" count={act.length} href={`${base}/projects`} linkLabel="Roadmap" wide>
          {act.length === 0 && <p className="small muted">No active projects.</p>}
          <div className="proj-grid">
            {act.map((p) => {
              const pct = projectProgress(p);
              const held = openClient.find((a) => a.projectId === p.id && ["overdue", "blocker"].includes(urgency(a, rules)));
              return (
                <Link href={`${base}/projects/${p.id}`} key={p.id} className="proj-mini">
                  <div className="row" style={{ alignItems: "baseline" }}>
                    <b className="ellipsis">{p.name}</b>
                    <span className="small muted">{pct}%</span>
                  </div>
                  <div style={{ marginTop: 8 }}><StepTrack p={p} /></div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    {currentStep(p) >= 0 ? <>Now: {p.steps[currentStep(p)].text}</> : <>Next: {p.nextMilestone}</>} · {fmt(p.milestoneDue)}
                  </div>
                  {held ? <div className="tiny" style={{ color: "var(--red)", marginTop: 4 }}>Held up by an overdue item</div> : <div style={{ marginTop: 6 }}><HealthChip h={projectHealth(p, actions.filter((a) => a.projectId === p.id), rules)} /></div>}
                </Link>
              );
            })}
          </div>
        </Tile>
      );
    },
    chat: () => {
      const feed = notes
        .filter((n) => n.clientId === client.id)
        .flatMap((n) => [{ by: n.author.name, text: n.text, at: n.at, ben: n.author.name === ADVISOR.name }, ...n.replies.map((r) => ({ by: r.by, text: r.text, at: r.at, ben: r.by === ADVISOR.name }))])
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-3);
      return (
        <Tile title="Chat with Ben" href={`${base}/board`} linkLabel="Open board">
          <div className="chat">
            {feed.length === 0 && <p className="small muted">No messages yet. Say hi.</p>}
            {feed.map((m, i) => (
              <div key={i} className={`bubble ${m.ben ? "ben" : "them"}`}>
                <div>{m.text}</div>
                <div className="tiny muted">{m.ben ? "Ben" : m.by.split(" ")[0]} · {fmtTime(m.at)}</div>
              </div>
            ))}
          </div>
          <form style={{ display: "flex", gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
            <input className="f" placeholder="Message Ben" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="btn primary" disabled={!msg.trim()}>Send</button>
          </form>
        </Tile>
      );
    },
    share: () => {
      const reqs = openClient.filter((a) => a.kind === "document" || a.kind === "information");
      const sent = files.filter((f) => f.clientId === client.id).length;
      return (
        <Tile title="Send files to Ben" href={`${base}/share`} linkLabel="Upload">
          <p className="small muted" style={{ marginBottom: 10 }}>Send documents securely. No email attachments.</p>
          {reqs.slice(0, 2).map((r) => (
            <Link href={`${base}/share`} className="row" key={r.id}>
              <div className="grow ellipsis small"><b>Ben asked for:</b> {r.title}</div>
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
      const waiting = candidates.filter((c) => !c.decision && myRoles.some((r) => r.id === c.roleId));
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
      const list = hires.filter((h) => h.clientId === client.id && h.status !== "Started").sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
      return (
        <Tile title="New hires" count={list.length} href={`${base}/hires`} wide>
          {list.slice(0, 3).map((h) => (
            <Link href={`${base}/hires/${h.id}`} className="row hire-mini" key={h.id}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">{h.name} <span className="tiny muted">· {h.title}</span></div>
                <Tracker h={h} compact noLabels />
                <div className="tiny muted" style={{ marginTop: 4 }}>{h.status}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="small"><b>{h.startDate ? shortDate(h.startDate) : "TBD"}</b></div>
                <div className="tiny muted">{startsIn(h.startDate)}</div>
              </div>
            </Link>
          ))}
          {list.length === 0 && <p className="small muted">No one in progress. Start a new hire when you&apos;re ready to make an offer.</p>}
          {(isAdvisor || me?.access === "exec") && <Link href={`${base}/hires/new`} className="btn block" style={{ marginTop: 10 }}>Add a new hire</Link>}
        </Tile>
      );
    },
    upcoming: () => {
      const up = projects.filter((p) => p.clientId === client.id && p.status === "planned").sort((a, b) => a.milestoneDue.localeCompare(b.milestoneDue)).slice(0, 3);
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
        <Tile title="Ben is working on" count={list.length} href={`${base}/tasks`}>
          {list.length === 0 && <p className="small muted">Nothing outstanding from Ben.</p>}
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
    huddle: () =>
      me && cfg ? (
        <Tile title="HR Huddle email">
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
            <span className="small muted">A short recap of what needs you and where projects stand. Quiet weeks are skipped.</span>
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
        <div className="row hero" style={{ alignItems: "flex-end" }}>
          <div>
            <h1>Hi {firstName}</h1>
            <p>
              {overdue.length > 0 && <span className="big">{overdue.length} overdue</span>}
              {overdue.length > 0 && dueToday.length > 0 && " · "}
              {dueToday.length > 0 && <b>{dueToday.length} due today</b>}
              {overdue.length + dueToday.length === 0 ? "You're all caught up." : ` across ${client.name}.`}
            </p>
          </div>
          <button className="btn sm" onClick={() => setEditing(true)}>Customize</button>
        </div>

        <div className="dash section" style={{ marginTop: 16 }}>
          {shown.map((id) => <div key={id} className={TILES.find((t) => t.id === id)?.wide ? "span2" : ""}>{tiles[id]?.()}</div>)}
        </div>
        {cfg?.softAsks !== false && <QuietAsks clientName={client.name} recruitingOn={!!cfg?.modules.recruiting} onSend={async (kind, text) => {
          const author = viewer?.kind === "client" ? viewer.person : ADVISOR;
          const n: Note = { id: `n${Date.now()}`, clientId: client.id, author, kind: "Message", text, urgent: false, at: new Date().toISOString(), status: "new", replies: [] };
          const sent = isAdvisor ? false : await notifyBen(`${client.name}: ${kind === "referral" ? "an introduction" : "a hiring need"} from ${author.name}`, `${author.name} (${author.role}) at ${client.name}:\n\n${text}`);
          patch({ notes: [{ ...n, emailed: sent }, ...notes] });
          if (!isAdvisor) notice({ clientId: client.id, kind: "note", text: `${author.name} ${kind === "referral" ? "sent an introduction" : "mentioned a hiring need"}`, href: "/console/board" });
          toast.show(kind === "referral" ? "Thank you. Ben will take it from here." : "Sent. Ben will follow up.");
        }} />}
        <p className="demo-note">Fictional sample data for the prototype.</p>
      </main>

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
      {asking && <AskBenSheet clientId={client.id} onClose={() => setAsking(false)} onDone={(m) => { setAsking(false); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
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
              <input type="checkbox" checked={x.on} onChange={() => setList(list.map((y) => (y.id === x.id ? { ...y, on: !y.on } : y)))} aria-label={`Show ${t.label}`} />
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
      <div className="sheet-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn ghost sm" onClick={onReset}>Reset to default</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(list.filter((x) => x.on).map((x) => x.id))}>Save</button>
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
          Know a company that could use a hand with HR? Introductions from people like you are how most of Ben's work starts.{" "}
          <button onClick={() => setOpen("referral")}>Make an intro</button>
        </div>
        {!recruitingOn && (
          <div>
            Hiring soon? Ben can run the search too.{" "}
            <button onClick={() => setOpen("hiring")}>Tell him about the role</button>
          </div>
        )}
      </div>
      {open === "referral" && (
        <Sheet title="Make an introduction" onClose={close}>
          <p className="small muted" style={{ marginTop: -4 }}>No pressure on them. Ben will reach out once, mention you, and keep it low key.</p>
          <label className="f">Their name and company</label>
          <input className="f" value={a} onChange={(e) => setA(e.target.value)} placeholder="Jordan at Northwind Studio" />
          <label className="f">Best way to reach them (optional)</label>
          <input className="f" value={b} onChange={(e) => setB(e.target.value)} placeholder="Email or phone, or say you'll connect us" />
          <label className="f">Anything Ben should know (optional)</label>
          <textarea className="f" value={c} onChange={(e) => setC(e.target.value)} placeholder="Growing fast, no HR person yet" />
          <div className="sheet-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" disabled={!a.trim()} onClick={() => { onSend("referral", `Introduction: ${a.trim()}${b.trim() ? `\nReach: ${b.trim()}` : ""}${c.trim() ? `\nContext: ${c.trim()}` : ""}`); close(); }}>Send to Ben</button>
          </div>
        </Sheet>
      )}
      {open === "hiring" && (
        <Sheet title="Tell Ben about the role" onClose={close}>
          <p className="small muted" style={{ marginTop: -4 }}>Just the basics. Ben will follow up with how a search would work for {clientName}.</p>
          <label className="f">Role</label>
          <input className="f" value={a} onChange={(e) => setA(e.target.value)} placeholder="Senior Producer" />
          <label className="f">When do you want them started?</label>
          <input className="f" value={b} onChange={(e) => setB(e.target.value)} placeholder="Early next quarter" />
          <label className="f">Anything else (optional)</label>
          <textarea className="f" value={c} onChange={(e) => setC(e.target.value)} />
          <div className="sheet-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" disabled={!a.trim()} onClick={() => { onSend("hiring", `Hiring need: ${a.trim()}${b.trim() ? `\nTiming: ${b.trim()}` : ""}${c.trim() ? `\nNotes: ${c.trim()}` : ""}`); close(); }}>Send to Ben</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
