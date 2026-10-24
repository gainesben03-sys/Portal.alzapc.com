"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Action, Client, CLIENTS, dueLabel, reminderStage, subtaskProgress, urgency, Urgency } from "@/lib/data";
import { useStore } from "@/lib/store";
import { usePathname } from "next/navigation";
import { canSee, MODULES } from "@/lib/modules";

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
  const { rules, getClient } = useStore();
  const client = getClient(a.clientId)!;
  const u: Urgency = urgency(a, rules);
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
              {a.side === "alza" ? "Owner: Alza (Ben)" : `Owner: ${a.owner.name}, ${a.owner.role}`}
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

export function useGuard(kind: "advisor" | "client", clientId?: string) {
  const { ready, viewer } = useStore();
  const router = useRouter();
  const ok =
    !!viewer &&
    (viewer.kind === "advisor" || (kind === "client" && viewer.kind === "client" && viewer.clientId === clientId));
  useEffect(() => {
    if (ready && !ok) router.replace("/");
  }, [ready, ok, router]);
  return ready && ok;
}

export function CompanySwitcher({ current }: { current?: string }) {
  const router = useRouter();
  const { getClient } = useStore();
  return (
    <select
      className="company-switch"
      value={current ?? ""}
      aria-label="Switch company"
      onChange={(e) => router.push(e.target.value ? `/c/${e.target.value}` : "/console")}
    >
      <option value="">All companies</option>
      {CLIENTS.map((c) => (
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
  const unread = notices.filter((n) => !n.read).length;
  const recent = notices.slice(0, 12);
  return (
    <div style={{ position: "relative" }}>
      <button className="bell" aria-label={`${unread} notifications`} onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="badge bell-badge">{unread}</span>}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
              <b>Notifications</b>
              {unread > 0 && (
                <button className="btn ghost sm" onClick={() => patch({ notices: notices.map((n) => ({ ...n, read: true })) })}>Mark all read</button>
              )}
            </div>
            {recent.length === 0 && <p className="small muted" style={{ padding: 14 }}>Nothing yet.</p>}
            {recent.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={`bell-item ${n.read ? "" : "unread"}`}
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
        <ThemeToggle />
        <Bell />
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
      <Link href={`/c/${client.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {client.logo ? <img src={client.logo} alt={client.name} className="client-logo" /> : <b>{client.name}</b>}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="powered hide-sm">
          powered by <span className="wordmark">Alza<span className="hr">HR</span></span>
        </span>
        <ThemeToggle />
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

export function ClientNav({ clientId }: { clientId: string }) {
  const { config, notes, viewer, me } = useStore();
  const path = usePathname();
  const cfg = config[clientId];
  const base = `/c/${clientId}`;
  const unread = viewer?.kind === "advisor" ? notes.filter((n) => n.clientId === clientId && n.status === "new").length : 0;
  const access = me?.access;
  const items = [
    ...(access === "hiring" ? [] : [{ href: base, label: "Home" }, { href: `${base}/projects`, label: "Projects" }]),
    ...MODULES.filter((m) => cfg?.modules[m.key] && canSee(access, m.key)).map((m) => ({ href: `${base}/${m.key}`, label: m.label })),
    ...(access === "hiring" ? [] : [{ href: `${base}/share`, label: "Share with HR" }]),
    ...(canSee(access, "team") ? [{ href: `${base}/team`, label: "Team" }] : []),
  ];
  return (
    <nav className="subnav">
      <div className="subnav-inner">
        {items.map((i) => {
          const on = i.href === base ? path === base || path.startsWith(`${base}/a/`) : path.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} className={on ? "on" : ""}>
              {i.label}
              {i.label === "Note board" && unread > 0 && <span className="badge">{unread}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AlzaNav() {
  const { notes, resources, files } = useStore();
  const path = usePathname();
  const newFiles = files.filter((f) => !f.reviewed).length;
  const unread = notes.filter((n) => n.status === "new").length;
  const stale = resources.filter((r) => r.outdated).length;
  const items = [
    { href: "/console", label: "Overview" },
    { href: "/console/board", label: "Notes", badge: unread },
    { href: "/console/files", label: "Files", badge: newFiles },
    { href: "/console/huddle", label: "HR Huddle" },
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
