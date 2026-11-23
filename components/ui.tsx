"use client";

import { Tour, TourButton } from "@/components/tour";
import { ContactBen } from "./contactben";
import { useLeaveAccess } from "@/lib/leaveclient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useHeldCount } from "@/lib/outboxclient";
import { Action, Client, dueLabel, ownsOpenWork, reminderStage, subtaskProgress, urgency, Urgency } from "@/lib/data";
import { useStore } from "@/lib/store";
import { usePathname } from "next/navigation";
import { canSee, ModuleKey } from "@/lib/modules";
import { DEMO_SITE } from "@/lib/state";

const DEMO_TABS = ["home", "hub", "people", "pulse"];
const DEMO_KEEP = ["", "/hub", "/hub/team", "/recognition", "/hires", "/reviews", "/roster", "/pulse", "/pulse/insights"];
import { PushButton, PushPrompt } from "./push";
import { AskBenSheet } from "./askben";

export function UrgencyPill({ a }: { a: Action }) {
  const { rules } = useStore();
  const u = urgency(a, rules);
  const label = u === "blocker" ? `Blocker · ${dueLabel(a)}` : dueLabel(a);
  return (
    <span className={`pill ${u}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function ActionCard({
  a,
  href,
  showClient,
  children,
}: {
  a: Action;
  href: string;
  showClient?: boolean;
  children?: ReactNode;
}) {
  const { rules, getClient, projects } = useStore();
  const client = getClient(a.clientId)!;
  const u: Urgency = urgency(a, rules);
  const project = a.projectId ? projects.find((p) => p.id === a.projectId) : undefined;
  return (
    <div className={`card action u-${u}`}>
      <Link href={href}>
        <div className="action-top">
          <div style={{ minWidth: 0 }}>
            {showClient && (
              <span className="client-chip" style={{ background: client.accent }}>
                {client.name}
              </span>
            )}
            <h3>{a.title}</h3>
            <div className="action-meta">
              {a.side === "alza" ? (a.requestedBy ? `Asked by ${a.requestedBy.name}` : "Owner: AlzaHR") : `Owner: ${a.owner.name}, ${a.owner.role}`}
              {project && <> · Part of {project.name}</>}
            </div>
          </div>
          <UrgencyPill a={a} />
        </div>
        {a.impact && a.status !== "completed" && (
          <div className="impact">
            <b>Why it matters:</b> {a.impact}
          </div>
        )}
        {a.subtasks?.length ? (
          <div style={{ marginTop: 10 }}>
            <div className="tiny muted">
              {a.subtasks.filter((x) => x.done).length} of {a.subtasks.length} steps done
            </div>
            <div className="bar" style={{ marginTop: 4 }}>
              <div style={{ width: `${subtaskProgress(a)}%` }} />
            </div>
          </div>
        ) : null}
      </Link>
      <div className="action-foot">
        {children}
        {a.side === "client" && <span className="stage">{reminderStage(a, client, rules)}</span>}
      </div>
    </div>
  );
}

export const RETURN_KEY = "alza-return-to";

/** Where a signed-out visitor was headed, if it's recent and somewhere this person may go. Used once. */
export function takeReturnPath(v: { kind: string; clientId?: string }): string | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    localStorage.removeItem(RETURN_KEY);
    const r = raw ? (JSON.parse(raw) as { path?: string; at?: number }) : null;
    const path = String(r?.path ?? "");
    if (!path.startsWith("/") || path.startsWith("//") || Date.now() - (r?.at ?? 0) > 2 * 3600e3) return null;
    if (v.kind === "advisor") return path.startsWith("/console") || path.startsWith("/c/") ? path : null;
    return v.clientId && (path === `/c/${v.clientId}` || path.startsWith(`/c/${v.clientId}/`) || path.startsWith(`/c/${v.clientId}?`)) ? path : null;
  } catch {
    return null;
  }
}

export function useGuard(kind: "advisor" | "client", clientId?: string) {
  const { ready, viewer, preview } = useStore();
  const router = useRouter();
  const ok =
    !!viewer &&
    (viewer.kind === "advisor" || (kind === "client" && viewer.kind === "client" && viewer.clientId === clientId));
  useEffect(() => {
    if (!ready || ok) return;
    // signed out (e.g. a link from an email on a new device): remember where they were going, so sign-in lands them there
    if (!viewer && !preview) {
      try {
        localStorage.setItem(RETURN_KEY, JSON.stringify({ path: window.location.pathname + window.location.search, at: Date.now() }));
      } catch {}
    }
    // while previewing as a client, anything outside their Alza Hub goes to their home page
    router.replace(preview ? (preview.access === "hiring" ? `/c/${preview.clientId}/recruiting` : `/c/${preview.clientId}`) : "/");
  }, [ready, ok, router, preview, viewer]);
  return ready && ok;
}

export function CompanySwitcher({ current }: { current?: string }) {
  const router = useRouter();
  const { getClient, clients } = useStore();
  return (
    <select
      className="company-switch"
      value={current ?? ""}
      aria-label="Switch company"
      onChange={(e) => router.push(e.target.value ? `/c/${e.target.value}` : "/console")}
    >
      <option value="">All companies</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {getClient(c.id)?.name}
        </option>
      ))}
    </select>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("alza-theme", next);
    } catch {}
  };
  return (
    <button className="theme-toggle" onClick={flip} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
      {theme === "dark" ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

export function Bell() {
  const { notices, patch, getClient } = useStore();
  const [open, setOpen] = useState(false);
  // the number counts only what needs Ben to do something; plain updates just get a dot
  const ACT = ["request", "extension", "revision", "upload", "pitch", "note"];
  const needs = notices.filter((n) => !n.read && ACT.includes(n.kind)).length;
  const fyi = notices.filter((n) => !n.read && !ACT.includes(n.kind)).length;
  const unread = needs + fyi;
  const recent = [...notices.slice(0, 30).filter((n) => ACT.includes(n.kind) && !n.read), ...notices.slice(0, 30).filter((n) => !(ACT.includes(n.kind) && !n.read))].slice(0, 12);
  return (
    <div style={{ position: "relative" }}>
      <button className="bell" aria-label={`${needs} need you, ${fyi} unread updates`} onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {needs > 0 ? <span className="badge bell-badge">{needs}</span> : fyi > 0 ? <span className="bell-dot" aria-hidden="true" /> : null}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
              <b>Notifications</b>{needs > 0 && <span className="tiny muted" style={{ marginLeft: 6 }}>{needs} need{needs === 1 ? "s" : ""} you</span>}
              {unread > 0 && (
                <button className="btn ghost sm" onClick={() => patch({ notices: notices.map((n) => ({ ...n, read: true })) })}>Mark all read</button>
              )}
            </div>
            {recent.length === 0 && <p className="small muted" style={{ padding: 14 }}>Nothing yet.</p>}
            {recent.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={`bell-item ${n.read ? "" : "unread"} ${!n.read && ACT.includes(n.kind) ? "act" : ""}`}
                onClick={() => {
                  patch({ notices: notices.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
                  setOpen(false);
                }}
              >
                <span className="client-chip" style={{ background: getClient(n.clientId)?.accent }}>{getClient(n.clientId)?.name.slice(0, 2).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="small" style={{ display: "block", color: "var(--ink)" }}>{n.text}</span>
                  <span className="tiny muted">{new Date(n.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AlzaTopbar({ title = "Console" }: { title?: string }) {
  const { setViewer } = useStore();
  const router = useRouter();
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Link href="/console" className="wordmark" aria-label="AlzaHR console">
          Alza<span className="hr">HR</span>
        </Link>
        <CompanySwitcher />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PushButton />
        <ThemeToggle />
        <Bell />
        <PushPrompt />
        <button
          className="viewer-switch"
          onClick={() => {
            setViewer(null);
            router.push("/");
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export function ClientTopbar({ client }: { client: Client }) {
  const { viewer, setViewer } = useStore();
  const router = useRouter();
  const isAdvisor = viewer?.kind === "advisor";
  return (
    <>
    {isAdvisor && (
      <div className="advisor-strip">
        <Link href="/console" className="wordmark" style={{ fontSize: 17 }}>Alza<span className="hr">HR</span></Link>
        <span className="tiny" style={{ opacity: 0.8 }}>Viewing</span>
        <CompanySwitcher current={client.id} />
        <Link href={`/console/clients/${client.id}`} className="tiny" style={{ marginLeft: "auto", color: "#9fc0e8" }}>
          Customize
        </Link>
        <Bell />
      </div>
    )}
    <header className="topbar client">
      <Link href={`/c/${client.id}`} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {client.logo ? <img src={client.logo} alt={client.name} className="client-logo" /> : <b>{client.name}</b>}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="powered hide-sm">
          powered by <span className="wordmark">Alza<span className="hr">HR</span></span>
        </span>
        {!isAdvisor && <span data-tour="push" style={{ display: "inline-flex" }}><PushButton /></span>}
        {!isAdvisor && <TourButton />}
        <ThemeToggle />
        <PushPrompt />
        {isAdvisor ? null : (
          <button
            className="viewer-switch"
            onClick={() => {
              setViewer(null);
              router.push("/");
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
    {!isAdvisor && <Tour company={client.name} homeHref={`/c/${client.id}`} />}
    </>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  return msg ? <div className="toast">{msg}</div> : null;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return { msg, show: setMsg, clear: () => setMsg(null) };
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/**
 * Five top tabs. Related pages sit underneath as small sub-tabs, so nothing is lost
 * but only what a busy executive uses is in front of them.
 */
export function ClientNav({ clientId }: { clientId: string }) {
  const { config, notes, viewer, me, people, actions } = useStore();
  const path = usePathname();
  const cfg = config[clientId];
  const base = `/c/${clientId}`;
  const isAdvisor = viewer?.kind === "advisor";
  const unread = isAdvisor ? notes.filter((n) => n.clientId === clientId && n.status === "new").length : 0;
  const access = me?.access;
  const mod = (k: ModuleKey) => !!cfg?.modules[k] && canSee(access, k);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const leaveAcc = useLeaveAccess(clientId);
  const obViewer = useMemo(() => (isAdvisor || access === "exec" ? { advisor: isAdvisor, clientId, name: "" } : null), [isAdvisor, access, clientId]);
  const heldHere = useHeldCount(obViewer, cfg ? [{ id: clientId, name: "" }] : []);

  type Sub = { href: string; label: string; match: string[]; badge?: number };
  // Manager Hub: anyone with people reporting to them on the roster; Learn also for executives. Ask HR lives under Resource Center.
  const leads = people.some((p) => p.clientId === clientId && p.active && (isAdvisor || (!!me?.email && p.managerEmail.toLowerCase() === me.email.toLowerCase())));
  const tools = leads || isAdvisor || access === "exec";
  const training = !!cfg?.modules.training && access !== "hiring";
  const groups: { key: string; label: string; subs: Sub[] }[] = [
    { key: "home", label: "Dashboard", subs: access === "hiring" ? [] : [{ href: base, label: "Home", match: [] }] },
    // Our Properties: its own tab when the module is on
    ...(cfg?.modules.properties && access !== "hiring" ? [{ key: "properties", label: "Our Properties", subs: [{ href: `${base}/properties`, label: "Our Properties", match: [`${base}/properties`] }] }] : []),
    {
      // Manager Hub: anyone who has people reporting to them on the roster (Ben sees it when there's a roster)
      key: "hub",
      label: "Team Hub",
      subs: [
        ...(leads
          ? [
              { href: `${base}/hub`, label: "Overview", match: [] },
              { href: `${base}/hub/team`, label: "Team", match: [`${base}/hub/team`, `${base}/hub/p/`] },
            ]
          : []),
        ...(cfg?.modules.recognition && access !== "hiring" ? [{ href: `${base}/recognition`, label: "Recognition", match: [`${base}/recognition`] }] : []),
        ...(tools ? [{ href: `${base}/hub/library`, label: training ? "Toolkit" : "Learn", match: [`${base}/hub/library`, ...(training ? [] : [`${base}/hub/learn`, `${base}/hub/view`])] }] : []),
      ],
    },
    {
      key: "todo",
      label: "Action Center",
      // managers get Projects only when a task there is theirs
      subs: access === "hiring" || (access === "manager" && !ownsOpenWork(actions, clientId, me?.name)) ? [] : [
        { href: `${base}/projects`, label: "Projects", match: [`${base}/projects`, `${base}/tasks`, `${base}/a/`] },
        ...(isAdvisor || access === "exec" ? [{ href: `${base}/roadmap`, label: "HR Roadmap", match: [`${base}/roadmap`] }] : []),
        ...(isAdvisor || access === "exec" ? [{ href: `${base}/outbox`, label: "Outbox", match: [`${base}/outbox`], badge: heldHere || undefined }] : []),
      ],
    },
    {
      key: "people",
      label: "People",
      subs: [
        ...(mod("hires") ? [{ href: `${base}/hires`, label: "New hires", match: [`${base}/hires`] }] : []),
        ...(mod("recruiting") ? [{ href: `${base}/recruiting`, label: "Recruiting", match: [`${base}/recruiting`] }] : []),
        ...(cfg?.modules.perform && access !== "hiring" ? [{ href: `${base}/reviews`, label: "Reviews", match: [`${base}/reviews`] }] : []),
        ...(leaveAcc.admin && (cfg?.modules.leave || isAdvisor) ? [{ href: `${base}/leave`, label: "Leave center", match: [`${base}/leave`] }] : []),
        ...((isAdvisor || access === "exec") && (cfg?.modules.offboarding || isAdvisor) ? [{ href: `${base}/offboarding`, label: "Offboarding", match: [`${base}/offboarding`] }] : []),
        ...(isAdvisor || access === "exec" ? [{ href: `${base}/roster`, label: "Roster", match: [`${base}/roster`] }] : []),
        ...(canSee(access, "team") ? [{ href: `${base}/team`, label: "Hub access", match: [`${base}/team`] }] : []),
      ],
    },
    {
      key: "pulse",
      label: "Pulse",
      // executives and HR only: survey results stay with leadership
      subs: cfg?.modules.pulse && (isAdvisor || access === "exec") ? [
        { href: `${base}/pulse`, label: "Overview", match: [] },
        { href: `${base}/pulse/surveys`, label: "Surveys", match: [`${base}/pulse/surveys`, `${base}/pulse/survey/`] },
        { href: `${base}/pulse/library`, label: "Library", match: [`${base}/pulse/library`, `${base}/pulse/new`] },
        { href: `${base}/pulse/insights`, label: "Insights", match: [`${base}/pulse/insights`] },
        { href: `${base}/pulse/actions`, label: "Action plan", match: [`${base}/pulse/actions`] },
      ] : [],
    },
    {
      key: "library",
      label: "Resource Center",
      subs: [
        ...(mod("resources") ? [{ href: `${base}/resources`, label: "Resources", match: [`${base}/resources`] }] : []),
        ...(tools && cfg?.askHr !== false ? [{ href: `${base}/hub/ask`, label: "Ask HR", match: [`${base}/hub/ask`] }] : []),
        ...(access !== "hiring" ? [{ href: `${base}/newsletters`, label: "Newsletters", match: [`${base}/newsletters`] }] : []),
        // Training lives here, not on the top line
        ...(training
          ? [
              { href: `${base}/training`, label: "Trainings", match: [`${base}/hub/learn`, `${base}/hub/view`] },
              ...(isAdvisor || access === "exec" ? [{ href: `${base}/training/progress`, label: "Who's practiced", match: [`${base}/training/progress`] }] : []),
            ]
          : []),
        ...(cfg?.modules.compliance && access !== "hiring" && (isAdvisor || access === "exec" || access === "manager") ? [{ href: `${base}/training/required`, label: "Required training", match: [`${base}/training/required`] }] : []),
        ...(access !== "hiring" ? [{ href: `${base}/pause`, label: "The Pause", match: [`${base}/pause`] }] : []),
        ...(mod("wellness") ? [{ href: `${base}/wellness`, label: "Wellness", match: [`${base}/wellness`] }] : []),
        ...(access !== "hiring" ? [{ href: `${base}/share`, label: "Send files", match: [`${base}/share`] }] : []),
      ],
    },
  ]
    .filter((g) => g.subs.length)
    // public demo: just the essentials, so it reads in seconds
    .map((g) => (DEMO_SITE ? { ...g, subs: g.subs.filter((x) => DEMO_KEEP.some((k) => x.href === `${base}${k}`)) } : g))
    .filter((g) => g.subs.length && (!DEMO_SITE || DEMO_TABS.includes(g.key)));

  const subOn = (x: Sub) => path === x.href || x.match.some((m) => path.startsWith(m));
  const current = groups.find((g) => g.subs.some(subOn));
  const groupBadge = (g: (typeof groups)[number]) => g.subs.reduce((n, x) => n + (x.badge ?? 0), 0);

  return (
    <nav className="subnav">
      <div className="subnav-inner">
        {groups.map((g) => (
          <Link key={g.key} href={g.subs[0].href} className={current?.key === g.key ? "on" : ""} data-tour={`nav-${g.key}`}>
            {g.label}
            {groupBadge(g) > 0 && <span className="badge">{groupBadge(g)}</span>}
          </Link>
        ))}
      </div>
      {current && (current.subs.length > 1 || current.key === "library") && (
        <div className="subnav-sub">
          <div className="subnav-sub-inner">
            {current.subs.length > 1 &&
              current.subs.map((x) => (
                <Link key={x.href} href={x.href} className={subOn(x) ? "on" : ""} data-tour={`sub-${x.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {x.label}
                  {!!x.badge && <span className="badge">{x.badge}</span>}
                </Link>
              ))}
            {current.key === "library" && access !== "hiring" && (
              <span style={{ marginLeft: "auto" }}><ContactBen /></span>
            )}
          </div>
        </div>
      )}
      {asking && <AskBenSheet clientId={clientId} onClose={() => setAsking(false)} onDone={(m) => { setAsking(false); setMsg(m); }} />}
      <Toast msg={msg} onDone={() => setMsg(null)} />
    </nav>
  );
}

const ADVISOR_VIEW = { advisor: true, name: "" };
export function AlzaNav() {
  const { notes, resources, files, hires } = useStore();
  const newHires = hires.filter((h) => h.status === "Approved to hire" && !(h.docs ?? []).length).length;
  const path = usePathname();
  const newFiles = files.filter((f) => !f.reviewed && !f.fromAdvisor).length;
  const unread = notes.filter((n) => n.status === "new").length;
  const stale = resources.filter((r) => r.outdated).length;
  const held = useHeldCount(ADVISOR_VIEW, []);
  const items = [
    { href: "/console", label: "Overview" },
    { href: "/console/board", label: "Notes", badge: unread },
    { href: "/console/inbox", label: "Email inbox" },
    { href: "/console/outbox", label: "Outbox", badge: held },
    { href: "/console/files", label: "Files", badge: newFiles },
    { href: "/console/hires", label: "New hires", badge: newHires },
    { href: "/console/huddle", label: "People Brief" },
    { href: "/console/newsletters", label: "Newsletters" },
    { href: "/console/pause", label: "The Pause" },
    { href: "/console/library", label: "Library", badge: stale },
    { href: "/console/clients", label: "Clients" },
    { href: "/console/rules", label: "Reminder rules" },
  ];
  return (
    <nav className="subnav dark">
      <div className="subnav-inner wide">
        {items.map((i) => {
          const on = i.href === "/console" ? path === "/console" : path.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} className={on ? "on" : ""}>
              {i.label}
              {!!i.badge && <span className="badge">{i.badge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
